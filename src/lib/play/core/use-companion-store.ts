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
}): {
  state: S;
  feed: E[];
  emit: CompanionEmit<E>;
  undo: () => void;
  canUndo: boolean;
  loaded: boolean;
} {
  const { storageKey, replay, reducer, compact, feed: feedFn, feedMax = 20, at: atFn } = opts;
  const [snapshot, setSnapshot] = useState<Snapshot<S>>({ base: null, log: [], rev: 0 });
  const [loaded, setLoaded] = useState(false);
  // Rev vivo para la cadena de escrituras: los setState son asíncronos y dos
  // emits seguidos no pueden partir del mismo rev. Mutar el ref EN el efecto
  // (patrón documentado de React) evita el error de lint `react-hooks/refs`.
  const snapRef = useRef(snapshot);
  useEffect(() => {
    snapRef.current = snapshot;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const record = await readCompanion(storageKey);
      if (cancelled) return;
      if (record) {
        try {
          // Validación por replay: si el registro no re-juega, está roto
          // también para la UI — se borra y se arranca de cero.
          replay((record.base as S | null) ?? null, record.log);
          setSnapshot({
            base: (record.base as S | null) ?? null,
            log: record.log,
            rev: record.rev,
          });
        } catch {
          await deleteCompanion(storageKey);
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // replay es estable por módulo; la clave es lo único que re-carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const state = useMemo(
    () => replay(snapshot.base, snapshot.log),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.base, snapshot.log],
  );

  const persist = useCallback(
    async (next: Snapshot<S>) => {
      const record: CompanionRecord = {
        identity: storageKey,
        v: 1,
        base: next.base,
        log: next.log,
        rev: next.rev,
      };
      const result = await writeCompanion(record);
      if (!result.ok && result.reason === "conflict") {
        // Otra pestaña escribió antes: se adopta su registro si re-juega.
        try {
          replay((result.current.base as S | null) ?? null, result.current.log);
          setSnapshot({
            base: (result.current.base as S | null) ?? null,
            log: result.current.log,
            rev: result.current.rev,
          });
        } catch {
          // vigente corrupto: nos quedamos con lo nuestro en memoria
        }
      }
      // "unavailable": memoria y a seguir.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
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
      setSnapshot(next);
      void persist(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist],
  );

  // Firma propia (no `CompanionEmit`) para que TS compruebe el CUERPO con el
  // `T` real de cada llamada; el cast va al devolver — dos firmas genéricas
  // que distribuyen `Extract` por caminos independientes no las relaciona el
  // checker aunque sean equivalentes (límite conocido de TS).
  const emit = useCallback(
    <T extends E["type"]>(type: T, payload: Extract<E, { type: T }>["payload"]): boolean => {
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
    [commit],
  );

  const undo = useCallback(() => {
    const current = snapRef.current;
    if (current.log.length === 0) return;
    commit(current.log.slice(0, -1));
  }, [commit]);

  const feed = useMemo(
    () => (feedFn ? feedFn(snapshot.log, feedMax) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.log],
  );

  return {
    state,
    feed,
    emit: emit as CompanionEmit<E>,
    undo,
    canUndo: snapshot.log.length > 0,
    loaded,
  };
}
