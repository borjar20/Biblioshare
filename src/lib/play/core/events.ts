import type { PlayEvent } from "./types";

// `at` se inyecta SIEMPRE (nada de Date.now() en el motor: pureza y tests
// deterministas). El reloj lo pone quien llama — la UI o el store.
export function makeEvent<T extends string, P>(
  type: T,
  payload: P,
  at: number,
  id: string = globalThis.crypto.randomUUID(),
): PlayEvent<T, P> {
  return { id, type, at, payload };
}
