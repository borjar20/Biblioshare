/**
 * Crono de la partida. Se DERIVA de `startedAt` (ni evento nuevo ni campo nuevo) y
 * cuenta reloj de pared, así que incluye el rato con la app cerrada — que es lo que
 * la gente entiende por «cuánto llevamos». Pausar sí costaría motor —evento nuevo y
 * un acumulado de tiempo pausado que tendría que vivir en el log— y queda fuera de
 * la fase 1 (issue #941).
 */
export function formatElapsed(ms: number): string {
  // Un tiempo negativo es alcanzable: el reloj del sistema puede retroceder con la
  // partida abierta, y por eso el motor tampoco exige monotonía en `at`
  // (`core/store.ts`). Se lee como cero en vez de como basura.
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
