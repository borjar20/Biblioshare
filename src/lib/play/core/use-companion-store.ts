"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeEvent } from "./events";
import type { PlayEvent } from "./types";
import {
  deleteCompanion,
  readCompanion,
  writeCompanion,
  type CompanionRecord,
} from "./db";

type Snapshot<S> = { base: S | null; log: PlayEvent[]; rev: number };
export type CompanionPersistence = "idle" | "pending" | "saved" | "memory";
type StoreSession = {
  key: string;
  token: { loadToken: object };
  active: boolean;
  loaded: boolean;
  epoch: number;
  pending: number;
  status: CompanionPersistence;
  tail: Promise<void>;
};

// Sólo el opt-in registra escrituras aceptadas. El mapa vive en el documento
// para que una instancia nueva también las espere antes de hidratar su clave.
// No ordena escrituras entre instancias: el CAS conserva ese arbitraje.
const acceptedWrites = new Map<string, Set<Promise<void>>>();

function trackAcceptedWrite(key: string, write: Promise<void>): void {
  const pending = acceptedWrites.get(key) ?? new Set<Promise<void>>();
  acceptedWrites.set(key, pending);
  pending.add(write);
  const release = () => {
    pending.delete(write);
    if (pending.size === 0 && acceptedWrites.get(key) === pending) acceptedWrites.delete(key);
  };
  // Limpia también un rechazo; no deja una promesa rechazada huérfana como
  // ocurriría al ignorar el resultado de finally().
  void write.then(release, release);
}

async function waitForAcceptedWrites(key: string): Promise<void> {
  for (;;) {
    const pending = acceptedWrites.get(key);
    if (!pending?.size) return;
    // Si otra instancia acepta más mientras esperamos, la siguiente vuelta
    // las incluye. Una clave distinta nunca espera por este registro.
    await Promise.allSettled(pending);
  }
}

// Tipo público de `emit`. Ver el comentario junto a la implementación sobre
// por qué se castea al devolver en vez de dejar que TS la relacione.
export type CompanionEmit<E extends PlayEvent> = <T extends E["type"]>(
  type: T,
  payload: Extract<E, { type: T }>["payload"],
) => boolean;

/**
 * Store genérico de acompañante (generalización del hook del Aleatorio, spec
 * reloj §1): carga de IDB con replay validado (registro corrupto se descarta),
 * dispatch con validación del reducer, compactación al pasar el umbral y
 * persistencia CAS. Sin IDB (privado, cuota) se sigue en memoria. En conflicto
 * CAS (otra pestaña) se ADOPTA el registro vigente. `storageKey` es la clave
 * del almacén `companion` (su keyPath se llama `identity` por herencia del
 * Aleatorio, que usa la identidad a secas; el reloj usa `${identity}:clock`).
 */
export function useCompanionStore<S, E extends PlayEvent>(opts: {
  storageKey: string;
  replay: (base: S | null, log: PlayEvent[]) => S;
  reducer: (state: S, event: E) => S;
  compact: (input: { base: S | null; log: PlayEvent[] }) => { base: S | null; log: PlayEvent[] };
  feed?: (log: PlayEvent[], max: number) => E[];
  feedMax?: number;
  /** timestamp del evento; por defecto Date.now(). Permite a un companion
   * clavar el tiempo a la monotonía de su estado. */
  at?: (state: S) => number;
  /** Opt-in: publica sólo tras la respuesta de IDB. Si no está disponible,
   * publica en memoria y lo hace observable mediante `persistence`. */
  publishAfterPersist?: boolean;
}): {
  state: S;
  feed: E[];
  emit: CompanionEmit<E>;
  undo: () => void;
  canUndo: boolean;
  loaded: boolean;
  persistence: CompanionPersistence;
} {
  const {
    storageKey, replay, reducer, compact, feed: feedFn, feedMax = 20, at: atFn,
    publishAfterPersist = false,
  } = opts;
  const [snapshot, setSnapshot] = useState<Snapshot<S>>({ base: null, log: [], rev: 0 });
  // Identifica la clave de este render. El token de sesión se crea en cada
  // efecto: Activity conserva useMemo/useState al ocultar y volver a mostrar.
  const loadToken = useMemo(() => ({ key: storageKey }), [storageKey]);
  const [loadedToken, setLoadedToken] = useState<StoreSession["token"] | null>(null);
  const [persistence, setPersistence] = useState<{
    key: string; status: CompanionPersistence;
  }>({ key: storageKey, status: "idle" });
  // Head lógico: puede ir por delante de lo publicado mientras IDB confirma.
  // Sólo hydrate, commit y una adopción CAS lo cambian; un render del snapshot
  // visible anterior no puede rebobinar una revisión ya reservada.
  const snapRef = useRef(snapshot);
  const sessionRef = useRef<StoreSession | null>(null);

  useEffect(() => {
    const session: StoreSession = {
      key: storageKey, token: { loadToken }, active: true, loaded: false, epoch: 0, pending: 0,
      status: "idle", tail: Promise.resolve(),
    };
    sessionRef.current = session;
    snapRef.current = { base: null, log: [], rev: 0 };
    (async () => {
      if (publishAfterPersist) await waitForAcceptedWrites(storageKey);
      if (!session.active) return;
      const record = await readCompanion(storageKey);
      if (!session.active) return;
      let initial: Snapshot<S> = { base: null, log: [], rev: 0 };
      if (record) {
        try {
          // Validación por replay: si el registro no re-juega, está roto
          // también para la UI — se borra y se arranca de cero.
          replay((record.base as S | null) ?? null, record.log);
          initial = {
            base: (record.base as S | null) ?? null,
            log: record.log,
            rev: record.rev,
          };
          session.status = "saved";
        } catch {
          await deleteCompanion(storageKey);
        }
      }
      if (!session.active) return;
      snapRef.current = initial;
      setSnapshot(initial);
      session.loaded = true;
      setPersistence({ key: storageKey, status: session.status });
      setLoadedToken(session.token);
    })();
    return () => {
      session.active = false;
      // También se ejecuta al ocultar Activity. La marca anterior no acredita
      // la nueva lectura, ni debe revivir callbacks de la sesión terminada.
      setLoadedToken(null);
    };
    // replay es estable por módulo; el opt-in y la clave fijan la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, loadToken, publishAfterPersist]);

  const state = useMemo(
    () => replay(snapshot.base, snapshot.log),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.base, snapshot.log],
  );

  const persist = useCallback(
    async (next: Snapshot<S>, session: StoreSession, epoch: number) => {
      const record: CompanionRecord = {
        identity: session.key,
        v: 1,
        base: next.base,
        log: next.log,
        rev: next.rev,
      };
      const result = await writeCompanion(record);
      if (session.epoch !== epoch) return;
      const canPublish = session.active && sessionRef.current === session;
      if (result.ok) {
        if (!canPublish) return;
        session.status = "saved";
        if (publishAfterPersist) setSnapshot(next);
        return;
      }
      if (!result.ok && result.reason === "conflict") {
        // Otra pestaña escribió antes: se adopta su registro si re-juega.
        try {
          replay((result.current.base as S | null) ?? null, result.current.log);
          const adopted: Snapshot<S> = {
            base: (result.current.base as S | null) ?? null,
            log: result.current.log,
            rev: result.current.rev,
          };
          // Los commits en cola partían del head perdido. No deben sobrescribir
          // la rama ganadora con un rev mayor y un log de la rama antigua.
          // El conflicto invalida esa cola aunque ya no haya UI que publicar;
          // desmontar sin conflicto mantiene las escrituras aceptadas.
          if (publishAfterPersist) session.epoch += 1;
          if (!canPublish) return;
          snapRef.current = adopted;
          setSnapshot(adopted);
          session.status = "saved";
          return;
        } catch {
          // vigente corrupto: nos quedamos con lo nuestro en memoria
        }
      }
      if (!canPublish) return;
      session.status = "memory";
      if (publishAfterPersist) setSnapshot(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publishAfterPersist],
  );

  const commit = useCallback(
    (log: PlayEvent[]) => {
      const current = snapRef.current;
      const compacted = compact({ base: current.base, log });
      const next: Snapshot<S> = { ...compacted, rev: current.rev + 1 };
      // Síncrono a propósito: un segundo emit/undo en el MISMO tick debe ver
      // este commit (si no, dos commits compartirían rev y el CAS perdería
      // uno en silencio).
      snapRef.current = next;
      const session = sessionRef.current;
      if (!session) return;
      const epoch = session.epoch;
      if (!publishAfterPersist) {
        setSnapshot(next);
        void persist(next, session, epoch);
        return;
      }
      session.pending += 1;
      setPersistence({ key: session.key, status: "pending" });
      session.tail = session.tail.then(async () => {
        try {
          if (session.epoch === epoch) await persist(next, session, epoch);
        } finally {
          session.pending -= 1;
          if (session.active && sessionRef.current === session) {
            setPersistence({
              key: session.key,
              status: session.pending > 0 ? "pending" : session.status,
            });
          }
        }
      });
      // Síncrono antes de devolver aceptación: una hidratación que empiece en
      // este mismo tick no debe adelantar las escrituras diferidas de la cola.
      trackAcceptedWrite(session.key, session.tail);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist, publishAfterPersist],
  );

  // Firma propia (no `CompanionEmit`) para que TS compruebe el CUERPO con el
  // `T` real de cada llamada; el cast va al devolver — dos firmas genéricas
  // que distribuyen `Extract` por caminos independientes no las relaciona el
  // checker aunque sean equivalentes (límite conocido de TS).
  const emit = useCallback(
    <T extends E["type"]>(type: T, payload: Extract<E, { type: T }>["payload"]): boolean => {
      const session = sessionRef.current;
      if (publishAfterPersist && (
        !session?.loaded || !session.active || session.token !== loadedToken ||
        loadedToken?.loadToken !== loadToken
      )) return false;
      const current = snapRef.current;
      const stateNow = replay(current.base, current.log);
      const at = atFn ? atFn(stateNow) : Date.now();
      const event = makeEvent(type, payload, at) as unknown as E;
      try {
        // Validación ANTES de comprometer: el reducer lanza ante payload inválido.
        reducer(stateNow, event);
      } catch {
        return false;
      }
      commit([...current.log, event]);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, publishAfterPersist, loadToken, loadedToken],
  );

  const undo = useCallback(() => {
    const session = sessionRef.current;
    if (publishAfterPersist && (
      !session?.loaded || !session.active || session.token !== loadedToken ||
      loadedToken?.loadToken !== loadToken
    )) return;
    const current = snapRef.current;
    if (current.log.length === 0) return;
    commit(current.log.slice(0, -1));
  }, [commit, publishAfterPersist, loadToken, loadedToken]);

  const feed = useMemo(
    () => (feedFn ? feedFn(snapshot.log, feedMax) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.log],
  );

  const loaded = loadedToken?.loadToken === loadToken;
  return {
    state,
    feed,
    emit: emit as CompanionEmit<E>,
    undo,
    canUndo: snapshot.log.length > 0,
    loaded,
    persistence: loaded && persistence.key === storageKey ? persistence.status : "idle",
  };
}
