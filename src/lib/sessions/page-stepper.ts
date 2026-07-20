// Lógica pura del bloque de progreso de libro. Separada del componente para
// poder testearla sin montar React (mismo patrón que lib/sessions/timer.ts).

// La página no puede ser negativa ni pasar del total de TU edición. Si no se
// conoce el total (edición sin páginas), no se topa: mejor dejar apuntar que
// bloquear al usuario con un dato que no tenemos.
export function clampPage(value: number, max: number | null): number {
  const page = Math.floor(value);
  if (Number.isNaN(page)) return 0;
  if (page < 0) return 0;
  if (max !== null && page > max) return max;
  return page;
}

export type ReadProgress = {
  /** Páginas de esta sesión. Puede ser negativo si corriges a la baja. */
  delta: number | null;
  remaining: number | null;
  /** % del rail ya leído antes de esta sesión. */
  readPct: number;
  /** % del rail que aporta esta sesión. 0 si el delta no es positivo. */
  sessionPct: number;
};

export function readProgress(
  from: number | null,
  to: number | null,
  total: number | null,
): ReadProgress {
  const delta = from !== null && to !== null ? to - from : null;
  const remaining = to !== null && total !== null ? total - to : null;

  if (total === null || total <= 0) {
    return { delta, remaining, readPct: 0, sessionPct: 0 };
  }

  const readPct = from !== null ? (from / total) * 100 : 0;
  // Un delta negativo no pinta tramo: el rail representa avance, y un
  // retroceso ya se comunica con el texto del delta.
  const sessionPct = delta !== null && delta > 0 ? (delta / total) * 100 : 0;

  return { delta, remaining, readPct, sessionPct };
}
