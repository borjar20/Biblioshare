"use client";

import { useCallback } from "react";
import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { ResourcesState } from "./types";
import type { ResourcesEvent } from "./events";
import { compactResourcesIfNeeded, replayResources, resourcesReducer } from "./reducer";

/**
 * Store del acompañante «Recursos». Clave propia (`${identity}:resources`) en
 * el almacén companion. Sin feed (no hay historial visible); `clear` = evento
 * cleared, deshacible como en el Aleatorio.
 */
export function useResources(identity: string): {
  state: ResourcesState;
  emit: CompanionEmit<ResourcesEvent>;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const store = useCompanionStore<ResourcesState, ResourcesEvent>({
    storageKey: `${identity}:resources`,
    replay: replayResources,
    reducer: resourcesReducer,
    compact: compactResourcesIfNeeded,
  });

  const { emit } = store;
  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  return { ...store, clear };
}
