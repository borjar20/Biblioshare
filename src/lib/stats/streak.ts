import { addDaysISO } from "./dates";

// La regla de la racha, en un solo sitio. La usan la racha GLOBAL del perfil
// (get-streaks.ts) y la racha POR PASE de la tarjeta de hoy: si cada una
// contara a su manera, la portada y el panel se contradirían y ninguna de las
// dos sería "la racha".
//
// Funciones puras sobre un conjunto de días "YYYY-MM-DD": quien las llama
// decide qué cuenta como actividad.

/** Días seguidos hasta hoy. Ayer también vale: una racha viva no se rompe
 *  porque aún no hayas leído HOY. */
export function currentStreak(activeDays: ReadonlySet<string>, today: string): number {
  if (activeDays.size === 0) return 0;
  let cursor = activeDays.has(today) ? today : addDaysISO(today, -1);
  let current = 0;
  while (activeDays.has(cursor)) {
    current += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return current;
}

/** La racha más larga que has tenido nunca. */
export function bestStreak(activeDays: ReadonlySet<string>): number {
  if (activeDays.size === 0) return 0;
  const days = [...activeDays].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === addDaysISO(days[i - 1], 1) ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Los últimos `size` días, del más antiguo a HOY, con si hubo actividad. */
export function lastDays(
  activeDays: ReadonlySet<string>,
  today: string,
  size = 7,
): { date: string; active: boolean }[] {
  return Array.from({ length: size }, (_, i) => {
    const date = addDaysISO(today, i - (size - 1));
    return { date, active: activeDays.has(date) };
  });
}
