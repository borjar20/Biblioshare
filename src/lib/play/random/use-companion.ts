"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import {
  deleteCompanion,
  readCompanion,
  writeCompanion,
  type CompanionRecord,
} from "@/lib/play/core/db";
import type { RandomState } from "./types";
import type { RandomEvent } from "./events";
import { compactIfNeeded, randomReducer, replayRandom } from "./reducer";
import { RESULT_EVENT_TYPES } from "./selectors";

type Snapshot = { base: RandomState | null; log: PlayEvent[]; rev: number };

const FEED_MAX = 20;

// Tipo público de `emit`, expuesto en la interfaz de retorno. Ver el
// comentario junto a la implementación (abajo) sobre por qué se castea al
// devolver en vez de dejar que TS la relacione estructuralmente.
type EmitFn = <T extends RandomEvent["type"]>(
  type: T,
  payload: Extract<RandomEvent, { type: T }>["payload"],
) => boolean;

/**
 * Estado del acompañante «Aleatorio» (spec §5): carga de IDB con replay
 * validado (registro corrupto se descarta, no se arrastra), dispatch con
 * validación del reducer, compactación al pasar el umbral y persistencia CAS.
 * Si IDB no está (privado, cuota), se sigue en memoria — mismo criterio que
 * el resto de Play. En conflicto CAS (otra pestaña), se ADOPTA el registro
 * vigente: sin sync de fondo, el último que escribe manda.
 */
export function useCompanion(identity: string): {
  state: RandomState;
  feed: RandomEvent[];
  emit: EmitFn;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const [snapshot, setSnapshot] = useState<Snapshot>({ base: null, log: [], rev: 0 });
  const [loaded, setLoaded] = useState(false);
  // Rev vivo para la cadena de escrituras: los setState son asíncronos y dos
  // emits seguidos no pueden partir del mismo rev. Mutar el ref EN el efecto
  // (patrón documentado de React, no durante el render) evita el error de
  // lint `react-hooks/refs` -- sin deps, corre tras CADA render, así que el
  // ref queda al día antes de que el siguiente clic pueda leerlo.
  const snapRef = useRef(snapshot);
  useEffect(() => {
    snapRef.current = snapshot;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const record = await readCompanion(identity);
      if (cancelled) return;
      if (record) {
        try {
          // Validación por replay: si el registro no re-juega, está roto
          // también para la UI — se borra y se arranca de cero.
          replayRandom((record.base as RandomState | null) ?? null, record.log);
          setSnapshot({
            base: (record.base as RandomState | null) ?? null,
            log: record.log,
            rev: record.rev,
          });
        } catch {
          await deleteCompanion(identity);
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const state = useMemo(
    () => replayRandom(snapshot.base, snapshot.log),
    [snapshot.base, snapshot.log],
  );

  const persist = useCallback(
    async (next: Snapshot) => {
      const record: CompanionRecord = {
        identity,
        v: 1,
        base: next.base,
        log: next.log,
        rev: next.rev,
      };
      const result = await writeCompanion(record);
      if (!result.ok && result.reason === "conflict") {
        // Otra pestaña escribió antes: se adopta su registro si re-juega.
        try {
          replayRandom((result.current.base as RandomState | null) ?? null, result.current.log);
          setSnapshot({
            base: (result.current.base as RandomState | null) ?? null,
            log: result.current.log,
            rev: result.current.rev,
          });
        } catch {
          // vigente corrupto: nos quedamos con lo nuestro en memoria
        }
      }
      // "unavailable": memoria y a seguir — sin IDB no hay nada mejor que hacer.
    },
    [identity],
  );

  const commit = useCallback(
    (log: PlayEvent[]) => {
      const current = snapRef.current;
      const compacted = compactIfNeeded({ base: current.base, log });
      const next: Snapshot = { ...compacted, rev: current.rev + 1 };
      setSnapshot(next);
      void persist(next);
    },
    [persist],
  );

  // Firma propia (no `EmitFn`) para que TS compruebe el CUERPO con el `T` real
  // de cada llamada -- `makeEvent(type, payload, …)` necesita que `payload`
  // siga ligado a `type` aquí dentro. El cast a `EmitFn` va al devolver
  // (abajo): dos firmas genéricas que distribuyen `Extract<RandomEvent, {
  // type: T }>` por caminos independientes (esta y la de la interfaz pública)
  // no las relaciona el checker aunque sean equivalentes en cada sitio de
  // llamada -- límite conocido de TS con generics de despacho, no un hueco
  // de tipos real.
  const emit = useCallback(
    <T extends RandomEvent["type"]>(
      type: T,
      payload: Extract<RandomEvent, { type: T }>["payload"],
    ): boolean => {
      const current = snapRef.current;
      const event = makeEvent(type, payload, Date.now()) as RandomEvent;
      try {
        // Validación ANTES de comprometer: el reducer lanza ante payload inválido.
        randomReducer(replayRandom(current.base, current.log), event);
      } catch {
        return false;
      }
      commit([...current.log, event]);
      return true;
    },
    [commit],
  );

  const undo = useCallback(() => {
    const current = snapRef.current;
    if (current.log.length === 0) return;
    commit(current.log.slice(0, -1));
  }, [commit]);

  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  const feed = useMemo(
    () =>
      [...snapshot.log]
        .reverse()
        .filter((e): e is RandomEvent => (RESULT_EVENT_TYPES as ReadonlySet<string>).has(e.type))
        .slice(0, FEED_MAX),
    [snapshot.log],
  );

  return {
    state,
    feed,
    emit: emit as EmitFn,
    undo,
    canUndo: snapshot.log.length > 0,
    clear,
    loaded,
  };
}
