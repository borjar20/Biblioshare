"use client";

import { append, appendTap, BURST_WINDOW_MS, emptyLog, flushPending, undoLast } from "./log";
import { replay } from "./replay";
import { PlayEventError } from "./errors";
import {
  deleteActive,
  readActive,
  saveFinished,
  writeActive,
  type ActiveGameRecord,
} from "./db";
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

export type ActiveGame = { log: EventLog; state: PlayGameState };

// Fase 3: IndexedDB no se lee síncrono, así que el snapshot distingue
// «hidratando» de «no hay partida». La UI NUNCA trata loading como vacío:
// redirigiría al hub un frame antes de saber si hay partida (spec fase 3 §3).
export type PlayStoreSnapshot =
  | { status: "loading"; game: null }
  | { status: "ready"; game: ActiveGame | null };

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

// #936: forma + semántica en UNA pasada — valida, sella la ráfaga pendiente y
// replaya una sola vez, devolviendo log y estado juntos.
export function parseLog(committed: unknown, pending: unknown): ActiveGame | null {
  if (!Array.isArray(committed) || !committed.every(isPlayEventShape)) return null;
  if (pending !== null && !isPlayEventShape(pending)) return null;
  const log = flushPending({ committed, pending: pending as PlayEvent | null });
  try {
    return { log, state: replay(log.committed) };
  } catch {
    return null;
  }
}

export function parseSnapshot(raw: string | null): ActiveGame | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as ActiveGameSnapshot;
    if (snapshot?.v !== SNAPSHOT_VERSION) return null;
    return parseLog(snapshot.committed, snapshot.pending);
  } catch {
    return null;
  }
}

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
  getSnapshot(): PlayStoreSnapshot;
  start(event: PlayEvent): boolean;
  tap(event: PlayEvent): boolean;
  dispatch(event: PlayEvent): boolean;
  undo(): PlayEvent | null;
  flush(): void;
  discard(): void;
  // Guarda la partida TERMINADA en el almacén local `saved` y limpia la
  // activa. false si no hay partida, no está terminada o la BD falla — en ese
  // caso la activa NO se toca (no se pierde nada por un fallo de guardado).
  save(): Promise<boolean>;
  // #935: retira listeners, cierra el canal y para el timer. El Map de stores
  // llama a esto al resetear; en producción un store vive lo que la página.
  destroy(): void;
};

function createPlayStore(identity: string): PlayStore {
  const legacyKey = playStorageKey(identity);
  let snapshot: PlayStoreSnapshot = { status: "loading", game: null };
  let rev = 0;
  const listeners = new Set<() => void>();
  let sealTimer: ReturnType<typeof setTimeout> | null = null;
  // Cola de escrituras: UNA en vuelo, orden garantizado, errores tragados
  // (sin BD se sigue jugando en memoria, spec fases 0-2 §4).
  let writeChain: Promise<void> = Promise.resolve();
  const controller = new AbortController();
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(`biblioshare:play:${identity}`)
      : null;

  function emit() {
    for (const callback of listeners) callback();
  }

  function enqueue(work: () => Promise<void>) {
    writeChain = writeChain.then(work).catch(() => {});
  }

  function recordFromGame(game: ActiveGame, recordRev: number): ActiveGameRecord {
    return {
      identity,
      v: SNAPSHOT_VERSION,
      committed: game.log.committed,
      pending: game.log.pending,
      rev: recordRev,
    };
  }

  // Otra pestaña ganó el CAS o publicó por el canal: su registro es la verdad.
  function adoptRecord(record: ActiveGameRecord) {
    const game = parseLog(record.committed, record.pending);
    rev = record.rev;
    snapshot = { status: "ready", game };
    emit();
  }

  // Persiste el snapshot actual (o borra si game === null) y avisa al canal.
  function persistCurrent() {
    const current = snapshot;
    if (current.status !== "ready") return;
    const currentRev = rev;
    if (current.game === null) {
      enqueue(async () => {
        await deleteActive(identity);
        channel?.postMessage({ rev: currentRev });
      });
      return;
    }
    const record = recordFromGame(current.game, currentRev);
    enqueue(async () => {
      const result = await writeActive(record);
      if (result.ok) {
        channel?.postMessage({ rev: record.rev });
      } else if (result.reason === "conflict") {
        adoptRecord(result.current);
      }
      // "unavailable": memoria y a seguir jugando
    });
  }

  function clearSealTimer() {
    if (sealTimer !== null) {
      clearTimeout(sealTimer);
      sealTimer = null;
    }
  }

  function scheduleSeal() {
    clearSealTimer();
    sealTimer = setTimeout(sealNow, BURST_WINDOW_MS);
  }

  function sealNow() {
    clearSealTimer();
    if (snapshot.status === "ready" && snapshot.game?.log.pending) {
      rev += 1;
      snapshot = {
        status: "ready",
        game: { log: flushPending(snapshot.game.log), state: snapshot.game.state },
      };
      persistCurrent();
      emit();
    }
  }

  // Único punto de commit real (finding 1): deriva el estado del candidato
  // ANTES de tocar `snapshot`, storage o listeners. Si el reducer lo rechaza
  // (PlayEventError), no se asigna nada, no se persiste nada, no se notifica
  // a nadie — el store queda exactamente como estaba. Si lo acepta, log y
  // estado se cachean juntos y getSnapshot() solo tiene que devolverlos.
  function tryCommit(candidateLog: EventLog): boolean {
    let state: PlayGameState;
    try {
      state = replay(candidateLog.committed, candidateLog.pending);
    } catch (error) {
      // PlayEventError es el reducer rechazando el evento por las reglas del
      // juego: una condición alcanzable desde una UI correcta (doble tap,
      // botón obsoleto) y el único caso que debe degradar a `false` en
      // silencio. Cualquier OTRA excepción (TypeError por un payload
      // malformado, etc.) es un defecto real, no un "double-tap" del
      // usuario, y debe propagarse — atraparla aquí la confundiría con un
      // evento inválido y la escondería del log de errores.
      if (!(error instanceof PlayEventError)) throw error;
      return false;
    }
    rev += 1;
    snapshot = { status: "ready", game: { log: candidateLog, state } };
    persistCurrent();
    emit();
    return true;
  }

  async function hydrate() {
    // Un microtask de más a propósito: persistCurrent() encola sus escrituras
    // vía writeChain.then(work), lo que le añade un tick antes de abrir su
    // propia transacción de IndexedDB. Sin igualar aquí ese hop, un store
    // recién creado en el MISMO tick que un start()/tap() anterior (el caso
    // de recrear el store justo tras escribir, en test o en producción)
    // pediría su lectura ANTES de que la escritura pidiera su transacción —y
    // la ganaría viendo la BD todavía vacía, perdiendo la partida recién
    // guardada aunque el commit ya se había aplicado en memoria.
    const record = await Promise.resolve().then(() => readActive(identity));
    if (controller.signal.aborted) return;
    if (record) {
      adoptRecord(record);
      return;
    }
    // Migración fase 1 → fase 3: el snapshot localStorage se importa una vez
    // y la clave se borra (válido o no: era el criterio destructivo-con-aviso
    // que fase 1 documentó). Spec fase 3 §5.
    let migrated: ActiveGame | null = null;
    try {
      migrated = parseSnapshot(globalThis.localStorage?.getItem(legacyKey) ?? null);
      globalThis.localStorage?.removeItem(legacyKey);
    } catch {
      // sin storage no hay nada que migrar
    }
    if (migrated) {
      rev = 1;
      snapshot = { status: "ready", game: migrated };
      persistCurrent();
      emit();
      return;
    }
    snapshot = { status: "ready", game: null };
    emit();
  }

  if (typeof document !== "undefined") {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") sealNow();
      },
      { signal: controller.signal },
    );
    window.addEventListener("pagehide", sealNow, { signal: controller.signal });
  }

  if (channel) {
    // Espejo entre pestañas (#932): un rev mayor que el nuestro = alguien
    // escribió después; se relee de BD y se adopta. Mientras se hidrata se
    // ignora: la hidratación en vuelo ya leerá lo último.
    channel.onmessage = (event: MessageEvent) => {
      const msgRev = (event.data as { rev?: number } | null)?.rev;
      if (typeof msgRev !== "number") return;
      if (snapshot.status !== "ready" || msgRev <= rev) return;
      void readActive(identity).then((record) => {
        if (controller.signal.aborted) return;
        if (record && record.rev > rev) {
          adoptRecord(record);
        } else if (!record) {
          rev = Math.max(rev, msgRev);
          snapshot = { status: "ready", game: null };
          emit();
        }
      });
    };
  }

  void hydrate();

  return {
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getSnapshot() {
      return snapshot;
    },
    start(event) {
      if (snapshot.status === "loading") return false;
      if (snapshot.game) {
        throw new Error("ya hay una partida activa; la UI debe interceptar antes (spec §4)");
      }
      return tryCommit(emptyLog(event));
    },
    tap(event) {
      if (snapshot.status !== "ready" || !snapshot.game) return false;
      const applied = tryCommit(appendTap(snapshot.game.log, event));
      if (applied) scheduleSeal();
      return applied;
    },
    dispatch(event) {
      if (snapshot.status !== "ready" || !snapshot.game) return false;
      const applied = tryCommit(append(snapshot.game.log, event));
      if (applied) clearSealTimer();
      return applied;
    },
    undo() {
      if (snapshot.status !== "ready" || !snapshot.game) return null;
      clearSealTimer();
      const result = undoLast(snapshot.game.log);
      if (result.undone === null) return null;
      rev += 1;
      snapshot = {
        status: "ready",
        game: { log: result.log, state: replay(result.log.committed, result.log.pending) },
      };
      persistCurrent();
      emit();
      return result.undone;
    },
    flush: sealNow,
    discard() {
      if (snapshot.status !== "ready") return;
      clearSealTimer();
      rev += 1;
      snapshot = { status: "ready", game: null };
      persistCurrent();
      emit();
    },
    async save() {
      sealNow(); // lo guardado es solo committed: la ráfaga se sella antes
      const current = snapshot;
      if (current.status !== "ready" || current.game === null) return false;
      if (current.game.state.status !== "finished") return false;
      const game = current.game;
      const ok = await saveFinished({
        gameId: game.log.committed[0].id,
        identity,
        v: SNAPSHOT_VERSION,
        committed: game.log.committed,
        savedAt: Date.now(),
      });
      if (!ok) return false;
      rev += 1;
      snapshot = { status: "ready", game: null };
      persistCurrent();
      emit();
      return true;
    },
    destroy() {
      clearSealTimer();
      controller.abort();
      channel?.close();
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

// Solo para tests: stores vírgenes, destruyendo los viejos (#935).
export function __resetPlayStoresForTests(): void {
  for (const store of stores.values()) store.destroy();
  stores.clear();
}

// Solo para tests que necesitan DOS stores de la misma identidad (espejo).
export function __createPlayStoreForTests(identity: string): PlayStore {
  return createPlayStore(identity);
}
