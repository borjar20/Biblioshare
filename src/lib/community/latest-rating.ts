export type RatedPass = {
  userId: string;
  // ISO (YYYY-MM-DD): comparable como cadena, el orden lexicográfico coincide
  // con el cronológico.
  finishedOn: string;
  rating: number;
};

// Un voto por usuario para la media y el histograma de comunidad: el de su
// pase cerrado más reciente para el ítem. Una relectura sustituye el voto de
// la lectura anterior (no se promedian ambos pases de la misma persona), así
// que alguien con un 8 en 2024 y un 9 al releer en 2026 vota 9, no 8.5.
export function latestRatingPerUser(rows: RatedPass[]): RatedPass[] {
  const byUser = new Map<string, RatedPass>();
  for (const row of rows) {
    const current = byUser.get(row.userId);
    if (!current || row.finishedOn > current.finishedOn) {
      byUser.set(row.userId, row);
    }
  }
  return [...byUser.values()];
}
