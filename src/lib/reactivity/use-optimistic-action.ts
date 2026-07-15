"use client";

import { useOptimistic, useState, useTransition } from "react";

// Capa de "sensación" de la reactividad: pinta el cambio al instante y deja que
// la capa de "verdad" (la revalidación del server action) reconcilie debajo. El
// optimismo va SIEMPRE encima de la revalidación, nunca en su lugar.
//
// Rollback automático: en error, el estado real (las props revalidadas del
// servidor) no cambió, así que useOptimistic revierte solo al valor de servidor
// cuando la transición se asienta. `failed` expone el error para pintarlo.
//
// El `reducer` es puro y se testea aparte (el runner es node-only, sin jsdom);
// este hook es solo el glue sobre useOptimistic + useTransition.
export function useOptimisticAction<TState, TAction>({
  state,
  reducer,
}: {
  state: TState;
  reducer: (state: TState, action: TAction) => TState;
}): {
  state: TState;
  isPending: boolean;
  failed: boolean;
  run: (action: TAction, mutate: () => Promise<void>) => void;
} {
  const [optimisticState, applyOptimistic] = useOptimistic(state, reducer);
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function run(action: TAction, mutate: () => Promise<void>) {
    setFailed(false);
    startTransition(async () => {
      applyOptimistic(action);
      try {
        await mutate();
      } catch {
        // El estado real no cambió → optimisticState revierte solo (rollback).
        setFailed(true);
      }
    });
  }

  return { state: optimisticState, isPending, failed, run };
}
