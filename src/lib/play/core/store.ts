import { append, appendTap, BURST_WINDOW_MS, emptyLog, flushPending, undoLast } from "./log";
import { replay } from "./replay";
import type { ActiveGameSnapshot, EventLog, PlayEvent } from "./types";
import type { PlayGameState } from "@/lib/play/tools";

// Store local-first. Anatomía de src/lib/sessions/timer.ts: lo puro arriba,
// el IO abajo con try/catch (modo privado o cuota llena degradan a memoria,
// nunca rompen la partida — spec §4). Este fichero es el ÚNICO del motor que
// toca navegador, y siempre con guardas.

export const SNAPSHOT_VERSION = 1 as const;

// Aislada por identidad: sin esto la partida del usuario A aparece en la
// cuenta B del mismo dispositivo (misma clase de fuga que el arreglo #680).
export function playStorageKey(identity: string): string {
  // Una identidad vacía (o solo espacios) colapsaría la clave a un valor
  // compartido ("biblioshare:play::active"): si dos cuentas reales pasaran
  // por aquí con identity="" —p. ej. la UI renderizando antes de que resuelva
  // el auth— sus partidas se fusionarían bajo la misma clave, justo la fuga
  // entre cuentas que este aislamiento por identidad existe para evitar. Las
  // llamadoras pasan un uid real o el literal "anon", nunca una cadena vacía.
  if (identity.trim() === "") {
    throw new Error("playStorageKey: identity no puede estar vacía");
  }
  return `biblioshare:play:${identity}:active`;
}

export function serializeSnapshot(log: EventLog): string {
  const snapshot: ActiveGameSnapshot = { v: SNAPSHOT_VERSION, committed: log.committed, pending: log.pending };
  return JSON.stringify(snapshot);
}

function isPlayEventShape(value: unknown): value is PlayEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  // at: timestamp finito razonable. NO se exige monotonia: el reloj del sistema
  // puede retroceder con la partida abierta; el orden verdadero es la posición
  // en el log (spec §4).
  return (
    typeof e.id === "string" &&
    typeof e.type === "string" &&
    typeof e.at === "number" &&
    Number.isFinite(e.at) &&
    e.at > 0 &&
    "payload" in e
  );
}

// Forma + semántica: el replay ES la validación (spec §4). Devuelve null en
// vez de lanzar: un snapshot malo se descarta, no tumba la app.
export function parseSnapshot(raw: string | null): EventLog | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as ActiveGameSnapshot;
    if (snapshot?.v !== SNAPSHOT_VERSION) return null;
    if (!Array.isArray(snapshot.committed) || !snapshot.committed.every(isPlayEventShape)) return null;
    if (snapshot.pending !== null && !isPlayEventShape(snapshot.pending)) return null;
    // Rehidratar sella la ráfaga pendiente (spec §3): entra ya committeada.
    const log = flushPending({ committed: snapshot.committed, pending: snapshot.pending });
    replay(log.committed);
    return log;
  } catch {
    return null;
  }
}

export type ActiveGame = { log: EventLog; state: PlayGameState };

export type PlayStore = {
  subscribe(callback: () => void): () => void;
  getSnapshot(): ActiveGame | null;
  start(event: PlayEvent): void;
  tap(event: PlayEvent): void;
  dispatch(event: PlayEvent): void;
  undo(): PlayEvent | null;
  flush(): void;
  discard(): void;
};

function createPlayStore(identity: string): PlayStore {
  const key = playStorageKey(identity);
  let log: EventLog | null = readStorage();
  let cached: ActiveGame | null = null;
  let dirty = true;
  const listeners = new Set<() => void>();
  let sealTimer: ReturnType<typeof setTimeout> | null = null;

  function readStorage(): EventLog | null {
    try {
      return parseSnapshot(globalThis.localStorage?.getItem(key) ?? null);
    } catch {
      return null;
    }
  }

  function persist() {
    try {
      if (log) globalThis.localStorage?.setItem(key, serializeSnapshot(log));
      else globalThis.localStorage?.removeItem(key);
    } catch {
      // sin storage se sigue jugando en memoria (spec §4)
    }
  }

  function emit() {
    dirty = true;
    persist();
    for (const callback of listeners) callback();
  }

  function clearSealTimer() {
    if (sealTimer !== null) {
      clearTimeout(sealTimer);
      sealTimer = null;
    }
  }

  // El puro (log.ts) no tiene reloj: la ventana de 1,5 s la programa el store
  // y también sella al ocultarse la página (spec §3, frontera puro/impuro).
  function scheduleSeal() {
    clearSealTimer();
    sealTimer = setTimeout(sealNow, BURST_WINDOW_MS);
  }

  function sealNow() {
    clearSealTimer();
    if (log?.pending) {
      log = flushPending(log);
      emit();
    }
  }

  // Estos listeners nunca se retiran (no hay destroy()): asume que el store
  // se crea una sola vez por identidad y vive lo que dure la página
  // (getPlayStore los cachea en `stores`). Si algún día un test con jsdom
  // recrea stores para la misma identidad, esto acumulará un par de
  // listeners por recreación — hoy es invisible porque el entorno "node" de
  // este suite no tiene `document`.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") sealNow();
    });
    window.addEventListener("pagehide", sealNow);
  }

  return {
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getSnapshot() {
      if (dirty) {
        cached = log ? { log, state: replay(log.committed, log.pending) } : null;
        dirty = false;
      }
      return cached;
    },
    start(event) {
      if (log) throw new Error("ya hay una partida activa; la UI debe interceptar antes (spec §4)");
      log = emptyLog(event);
      emit();
    },
    tap(event) {
      if (!log) return;
      log = appendTap(log, event);
      scheduleSeal();
      emit();
    },
    dispatch(event) {
      if (!log) return;
      clearSealTimer();
      log = append(log, event);
      emit();
    },
    undo() {
      if (!log) return null;
      clearSealTimer();
      const result = undoLast(log);
      if (result.undone === null) return null;
      log = result.log;
      emit();
      return result.undone;
    },
    flush: sealNow,
    discard() {
      clearSealTimer();
      log = null;
      emit();
    },
  };
}

const stores = new Map<string, PlayStore>();

export function getPlayStore(identity: string): PlayStore {
  let store = stores.get(identity);
  if (!store) {
    store = createPlayStore(identity);
    stores.set(identity, store);
  }
  return store;
}

// Solo para tests: fuerza a releer localStorage con stores vírgenes.
export function __resetPlayStoresForTests(): void {
  stores.clear();
}
