"use client";

import { useCallback } from "react";
import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { RandomState } from "./types";
import type { RandomEvent } from "./events";
import { compactIfNeeded, randomReducer, replayRandom } from "./reducer";
import { resultFeed } from "./selectors";

const FEED_MAX = 20;

/**
 * Estado del acompañante «Aleatorio» sobre el store genérico de core (spec
 * reloj §1). Conserva la clave HISTÓRICA (`identity` a secas) — sin migración
 * de datos — y añade `clear` (evento `cleared`) sobre la interfaz común.
 */
export function useCompanion(identity: string): {
  state: RandomState;
  feed: RandomEvent[];
  emit: CompanionEmit<RandomEvent>;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const store = useCompanionStore<RandomState, RandomEvent>({
    storageKey: identity,
    replay: replayRandom,
    reducer: randomReducer,
    compact: compactIfNeeded,
    feed: resultFeed,
    feedMax: FEED_MAX,
  });

  const { emit } = store;
  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  return { ...store, clear };
}
