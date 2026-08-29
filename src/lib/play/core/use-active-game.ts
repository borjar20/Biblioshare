"use client";

import { useSyncExternalStore } from "react";
import { getPlayStore, type ActiveGame, type PlayStore } from "./store";

// Constante fuera del hook: un getServerSnapshot nuevo por render provoca
// bucle de re-suscripción (misma trampa resuelta en use-timer-state.ts).
const getServerSnapshot = () => null;

export function useActiveGame(identity: string): { game: ActiveGame | null; store: PlayStore } {
  const store = getPlayStore(identity);
  const game = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  return { game, store };
}
