"use client";

import { append, appendTap, BURST_WINDOW_MS, emptyLog, flushPending, undoLast } from "./log";
import { replay } from "./replay";
import type { ActiveGameSnapshot, EventLog, PlayEvent } from "./types";
import type { PlayGameState } from "@/lib/play/tools";

// Store local-first. Anatomía de src/lib/sessions/timer.ts: lo puro arriba,
// el IO abajo con try/catch (modo privado o cuota llena degradan a memoria,
// nunca rompen la partida — spec §4). Este fichero es el ÚNICO del motor que
// toca navegador, y siempre con guardas.
//
// "use client" (finding 5 de la revisión final): este módulo guarda un Map a
// nivel de módulo, `stores`, indexado por identidad. En un componente de
// servidor (páginas de este repo son shells de servidor, spec §5) ese Map
// sería un singleton por proceso compartido entre TODAS las peticiones — la
// forma exacta de fuga entre cuentas que regla #437 prohíbe. Hoy nada
// server-side importa este fichero, así que no hay fuga real todavía; la
// directiva es preventiva: si algún día alguien lo importa desde un Server
// Component, el bundler falla en vez de crear el singleton en silencio.

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

// Señal de fallo de start/tap/dispatch (finding 1 de la revisión final): las
// tres devuelven boolean — true si el evento se aplicó. Un evento rechazado
// por el reducer (doble eliminación, evento tras game_finished, participante
// desconocido...) es una condición ALCANZABLE desde una UI correcta (doble
// tap antes de re-render, botón obsoleto tras acabar la partida) y NO debe
// tumbar el render ni persistirse a medias: la UI decide qué hacer con
// `false` (p. ej. mostrar "acción no válida"). start() sigue LANZANDO, pero
// solo cuando ya hay una partida activa — eso es un error de programación
// (la UI debe comprobarlo antes de llamar, no una entrada de usuario) y por
// tanto no comparte canal de señal con un evento inválido.
export type PlayStore = {
  subscribe(callback: () => void): () => void;
  getSnapshot(): ActiveGame | null;
  start(event: PlayEvent): boolean;
  tap(event: PlayEvent): boolean;
  dispatch(event: PlayEvent): boolean;
  undo(): PlayEvent | null;
  flush(): void;
  discard(): void;
};

function createPlayStore(identity: string): PlayStore {
  const key = playStorageKey(identity);

  function readStorage(): ActiveGame | null {
    try {
      const log = parseSnapshot(globalThis.localStorage?.getItem(key) ?? null);
      if (!log) return null;
      // parseSnapshot ya replayó para validar forma+semántica (spec §4); este
      // segundo replay solo obtiene el estado a cachear. Va blindado igual:
      // getSnapshot es estructuralmente incapaz de lanzar (finding 1), incluso
      // en la rehidratación, así que ni aquí se deja escapar una excepción.
      return { log, state: replay(log.committed, log.pending) };
    } catch {
      return null;
    }
  }

  let game: ActiveGame | null = readStorage();
  const listeners = new Set<() => void>();
  let sealTimer: ReturnType<typeof setTimeout> | null = null;

  function persist() {
    try {
      if (game) globalThis.localStorage?.setItem(key, serializeSnapshot(game.log));
      else globalThis.localStorage?.removeItem(key);
    } catch {
      // sin storage se sigue jugando en memoria (spec §4)
    }
  }

  function emit() {
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
    if (game?.log.pending) {
      // Solo mueve el evento de pending a committed: el estado cacheado ya
      // incluía el efecto del pending (se derivó junto con él al commitear),
      // así que no hace falta re-derivar.
      game = { log: flushPending(game.log), state: game.state };
      emit();
    }
  }

  // Único punto de commit real (finding 1): deriva el estado del candidato
  // ANTES de tocar `game`, storage o listeners. Si el reducer lo rechaza
  // (PlayEventError), no se asigna nada, no se persiste nada, no se notifica
  // a nadie — el store queda exactamente como estaba. Si lo acepta, log y
  // estado se cachean juntos y getSnapshot() solo tiene que devolverlos.
  function tryCommit(candidateLog: EventLog): boolean {
    let state: PlayGameState;
    try {
      state = replay(candidateLog.committed, candidateLog.pending);
    } catch {
      return false;
    }
    game = { log: candidateLog, state };
    emit();
    return true;
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
    // Ya no deriva nada: el estado se calcula al commitear (tryCommit) o al
    // rehidratar (readStorage). Devolver la referencia cacheada es lo único
    // que hace falta para que esto sea estructuralmente incapaz de lanzar.
    getSnapshot() {
      return game;
    },
    start(event) {
      if (game) throw new Error("ya hay una partida activa; la UI debe interceptar antes (spec §4)");
      // Aquí SÍ puede llegar un evento inválido (game_started con un setup
      // fuera de rango, o directamente un evento que no es game_started): se
      // trata igual que tap/dispatch, no como el caso de arriba.
      return tryCommit(emptyLog(event));
    },
    tap(event) {
      if (!game) return false;
      const applied = tryCommit(appendTap(game.log, event));
      if (applied) scheduleSeal();
      return applied;
    },
    dispatch(event) {
      if (!game) return false;
      const applied = tryCommit(append(game.log, event));
      if (applied) clearSealTimer();
      return applied;
    },
    undo() {
      if (!game) return null;
      clearSealTimer();
      const result = undoLast(game.log);
      if (result.undone === null) return null;
      // Deshacer siempre deja un PREFIJO de un log que ya era válido (nunca
      // añade eventos), así que el replay aquí no puede fallar — a diferencia
      // de start/tap/dispatch no hace falta pasar por tryCommit.
      game = { log: result.log, state: replay(result.log.committed, result.log.pending) };
      emit();
      return result.undone;
    },
    flush: sealNow,
    discard() {
      clearSealTimer();
      game = null;
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
