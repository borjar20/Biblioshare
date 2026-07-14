export type RatedPass = {
  id: string;
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
//
// El empate de fecha no debería existir —un índice único impide cerrar dos
// pases del mismo ítem el mismo día— pero se desempata por `id` de todos modos:
// que la media de una ficha dependa del orden en que Postgres devuelva las
// filas sería un número que parpadea sin que nadie haya tocado nada.
export function latestRatingPerUser(rows: RatedPass[]): RatedPass[] {
  const byUser = new Map<string, RatedPass>();
  for (const row of rows) {
    const current = byUser.get(row.userId);
    const wins =
      !current ||
      row.finishedOn > current.finishedOn ||
      (row.finishedOn === current.finishedOn && row.id > current.id);
    if (wins) byUser.set(row.userId, row);
  }
  return [...byUser.values()];
}
