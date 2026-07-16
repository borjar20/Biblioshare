// Cronómetro de sesión. Guarda el INSTANTE de arranque, no un contador
// corriendo: así sobrevive a recargar y a cerrar la app, y el tiempo sigue
// avanzando aunque la pestaña esté dormida. El estado vive en localStorage
// (por dispositivo): leer no suele repartirse entre móvil y portátil, y
// llevarlo a la base de datos costaría tabla, acciones y conflictos.
export type TimerState = { startedAt: number | null; accumulatedMs: number };

const STALE_MS = 4 * 60 * 60 * 1000;

export function reset(): TimerState {
  return { startedAt: null, accumulatedMs: 0 };
}

export function start(state: TimerState, now: number): TimerState {
  return state.startedAt !== null ? state : { ...state, startedAt: now };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.startedAt === null) return state;
  return { startedAt: null, accumulatedMs: elapsedMs(state, now) };
}

export function elapsedMs(state: TimerState, now: number): number {
  const running = state.startedAt === null ? 0 : now - state.startedAt;
  return state.accumulatedMs + Math.max(0, running);
}

// Te lo dejaste corriendo: más de 4 horas seguidas sin pausar.
export function isStale(state: TimerState, now: number): boolean {
  return state.startedAt !== null && now - state.startedAt > STALE_MS;
}

export function toMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export const timerStorageKey = (passId: string) => `biblioshare:timer:${passId}`;
