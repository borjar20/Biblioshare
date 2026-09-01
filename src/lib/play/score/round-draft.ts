/**
 * Borrador de la hoja de ronda: un valor por asiento, cambiado a golpes de
 * chip (±5/±10/±20) o de stepper (±1). Sin clamp: el reducer de puntuación
 * admite negativos y no tiene tope; aquí solo se garantiza entero.
 */
export function applyDelta(values: number[], seat: number, delta: number): number[] {
  if (seat < 0 || seat >= values.length) return [...values];
  return values.map((v, i) => (i === seat ? Math.trunc(v + delta) : v));
}

export const QUICK_DELTAS = [5, 10, 20, -5, -10] as const;
