"use client";

import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { ClockState } from "./types";
import type { ClockEvent } from "./events";
import { clockReducer, compactClockIfNeeded, replayClock } from "./reducer";

/**
 * Store del acompañante «Reloj» sobre el hook genérico de core. Clave propia
 * (`${identity}:clock`) para no pisar el registro del Aleatorio, que usa la
 * identidad a secas. Sin feed ni clear: el historial del reloj no se lista.
 */
export function useClock(identity: string): {
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
  undo: () => void;
  canUndo: boolean;
  loaded: boolean;
} {
  return useCompanionStore<ClockState, ClockEvent>({
    storageKey: `${identity}:clock`,
    replay: replayClock,
    reducer: clockReducer,
    compact: compactClockIfNeeded,
  });
}
