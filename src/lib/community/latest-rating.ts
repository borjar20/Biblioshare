export type RatedPass = {
  id: string;
  userId: string;
  // ISO (YYYY-MM-DD): comparable como cadena, el orden lexicográfico coincide
  // con el cronológico.
  finishedOn: string;
  rating: number;
  createdAt?: string;
};

// The viewing date wins, then registration order, then UUID for legacy ties.
function keepLatestPerGroup<T extends { id: string; finishedOn: string; createdAt?: string }>(
  rows: T[],
  groupKeyOf: (row: T) => string
): T[] {
  const byGroup = new Map<string, T>();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const current = byGroup.get(key);
    const wins =
      !current ||
      row.finishedOn > current.finishedOn ||
      (row.finishedOn === current.finishedOn &&
        ((row.createdAt ?? "") > (current.createdAt ?? "") ||
          ((row.createdAt ?? "") === (current.createdAt ?? "") && row.id > current.id)));
    if (wins) byGroup.set(key, row);
  }
  return [...byGroup.values()];
}

// Un voto por usuario para la media y el histograma de comunidad: el de su
// pase cerrado más reciente para el ítem. Una relectura sustituye el voto de
// la lectura anterior (no se promedian ambos pases de la misma persona), así
// que alguien con un 8 en 2024 y un 9 al releer en 2026 vota 9, no 8.5.
export function latestRatingPerUser<T extends RatedPass>(rows: T[]): T[] {
  return keepLatestPerGroup(rows, (r) => r.userId);
}

// Mismo criterio que arriba, pero agrupado por OBRA (item_type:item_id) en
// vez de por usuario: library/get-library-items.ts lo usa para sacar la nota
// y la reseña visibles de la propia colección del último pase CERRADO de cada
// obra (library_entries.rating/notes quedaron huérfanas cuando el pase se
// convirtió en su dueño — ver 20260714_passes.sql; el agrupado pasó de
// library_entry_id a itemKey en la Tarea 9, cuando library_entries dejó de
// ser lo que se lee). A diferencia de RatedPass, aquí `rating` puede ser null
// (un pase cerrado sin puntuar sigue siendo "el último pase").
export function keepLatestClosedPass<
  T extends { id: string; itemKey: string; finishedOn: string; createdAt?: string },
>(rows: T[]): T[] {
  return keepLatestPerGroup(rows, (r) => r.itemKey);
}
