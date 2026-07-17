// Cronómetro de sesión. Guarda el INSTANTE de arranque, no un contador
// corriendo: así sobrevive a recargar y a cerrar la app, y el tiempo sigue
// avanzando aunque la pestaña esté dormida. El estado vive en localStorage
// (por dispositivo): leer no suele repartirse entre móvil y portátil, y
// llevarlo a la base de datos costaría tabla, acciones y conflictos.
// `startedAt` es el instante del arranque ACTUAL (null cuando está pausado);
// `firstStartedAt` es el del PRIMER arranque de la sesión y NO se borra al
// pausar — es la hora real de inicio para "Cuándo lees" (plan 05, P8). Solo
// reset/clear lo limpian.
export type TimerState = {
  startedAt: number | null;
  accumulatedMs: number;
  firstStartedAt?: number | null;
};

const STALE_MS = 4 * 60 * 60 * 1000;

export function reset(): TimerState {
  return { startedAt: null, accumulatedMs: 0, firstStartedAt: null };
}

export function start(state: TimerState, now: number): TimerState {
  if (state.startedAt !== null) return state;
  return {
    ...state,
    startedAt: now,
    firstStartedAt: state.firstStartedAt ?? now,
  };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.startedAt === null) return state;
  return {
    startedAt: null,
    accumulatedMs: elapsedMs(state, now),
    firstStartedAt: state.firstStartedAt ?? null,
  };
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

// ── Persistencia ────────────────────────────────────────────────────────────
// Vive aquí, y no en cada componente, porque desde el plan 01 hay DOS
// cronómetros sobre el mismo pase: el de la vista de sesión y el de la tarjeta
// de hoy. Son el mismo reloj — misma clave — así que arrancarlo en la portada y
// abrir la vista de sesión no pierde un segundo. Con una copia de estas
// funciones en cada sitio, tarde o temprano divergirían.

function isTimerState(value: unknown): value is TimerState {
  return (
    typeof value === "object" &&
    value !== null &&
    (typeof (value as TimerState).startedAt === "number" ||
      (value as TimerState).startedAt === null) &&
    typeof (value as TimerState).accumulatedMs === "number"
  );
}

const listeners = new Set<() => void>();

/** Avisa a los cronómetros vivos de ESTA pestaña (el evento `storage` del
 *  navegador solo llega a las demás). */
export function subscribeTimer(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function readTimer(passId: string): TimerState {
  if (typeof window === "undefined") return reset();
  try {
    const raw = window.localStorage.getItem(timerStorageKey(passId));
    if (!raw) return reset();
    const parsed: unknown = JSON.parse(raw);
    return isTimerState(parsed) ? parsed : reset();
  } catch {
    return reset();
  }
}

export function writeTimer(passId: string, state: TimerState): void {
  try {
    window.localStorage.setItem(timerStorageKey(passId), JSON.stringify(state));
  } catch {
    // Cuota llena o almacenamiento inaccesible (modo privado): el cronómetro
    // sigue funcionando en memoria durante esta sesión de página.
  }
  emit();
}

export function clearTimer(passId: string): void {
  try {
    window.localStorage.removeItem(timerStorageKey(passId));
  } catch {
    // Ídem.
  }
  emit();
}
