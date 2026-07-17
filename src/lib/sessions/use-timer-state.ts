"use client";

import { useSyncExternalStore } from "react";
import { readTimer, reset, subscribeTimer, type TimerState } from "./timer";

// El cronómetro guardado, leído como lo que es: un almacén EXTERNO a React.
//
// La alternativa obvia —leerlo en el inicializador de useState— desincroniza
// servidor y cliente (el servidor no tiene localStorage) y saca un aviso de
// hidratación; y corregirlo con un setState dentro de un efecto es justo lo que
// el lint del repo prohíbe. useSyncExternalStore está hecho para esto: el
// servidor ve el reloj a cero y el cliente lo sustituye al hidratar, sin
// mismatch y sin efectos.
//
// getSnapshot DEBE devolver la misma referencia mientras no cambie el
// almacenado, o React entra en bucle. De ahí la caché por clave.
const cache = new Map<string, { raw: string; value: TimerState }>();
const SERVER_SNAPSHOT: TimerState = { startedAt: null, accumulatedMs: 0 };

function snapshot(passId: string): TimerState {
  const stored = readTimer(passId);
  const raw = JSON.stringify(stored);
  const cached = cache.get(passId);
  if (cached && cached.raw === raw) return cached.value;
  cache.set(passId, { raw, value: stored });
  return stored;
}

export function useTimerState(passId: string): TimerState {
  return useSyncExternalStore(
    subscribeTimer,
    () => snapshot(passId),
    () => SERVER_SNAPSHOT,
  );
}

/** ¿Hay un cronómetro que enseñar? Corriendo o parado con tiempo dentro. */
export function hasTime(state: TimerState): boolean {
  return state.startedAt !== null || state.accumulatedMs > 0;
}

export { reset };
