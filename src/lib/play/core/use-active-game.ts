"use client";

import { useSyncExternalStore } from "react";
import {
  getPlayStore,
  type ActiveGame,
  type PlayStore,
  type PlayStoreSnapshot,
} from "./store";

// Constantes fuera del hook: un getServerSnapshot nuevo por render provoca
// bucle de re-suscripción (misma trampa resuelta en use-timer-state.ts). En
// servidor SIEMPRE es loading: el cliente hidrata igual y no hay mismatch.
const SERVER_SNAPSHOT: PlayStoreSnapshot = { status: "loading", game: null };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useActiveGame(identity: string): {
  snapshot: PlayStoreSnapshot;
  game: ActiveGame | null;
  store: PlayStore;
} {
  const store = getPlayStore(identity);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  return { snapshot, game: snapshot.game, store };
}
