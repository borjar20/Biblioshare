"use client";

import { useCallback } from "react";
import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { TurnsState } from "./types";
import type { TurnsEvent } from "./events";
import { compactTurnsIfNeeded, replayTurns, turnsReducer } from "./reducer";

/**
 * Store del acompañante «Turnos». Clave propia (`${identity}:turns`). Sin
 * feed; `clear` = evento cleared. Deshacer va expuesto en la UI: revertir un
 * avance accidental es EL caso de uso.
 */
export function useTurns(identity: string): {
  state: TurnsState;
  emit: CompanionEmit<TurnsEvent>;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const store = useCompanionStore<TurnsState, TurnsEvent>({
    storageKey: `${identity}:turns`,
    replay: replayTurns,
    reducer: turnsReducer,
    compact: compactTurnsIfNeeded,
  });

  const { emit } = store;
  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  return { ...store, clear };
}
