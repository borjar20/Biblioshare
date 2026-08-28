import type { LibraryItem } from "./types";

export function getProgress(
  item: LibraryItem
): { current: number; total: number; label: string } | null {
  if (
    item.itemType === "book" &&
    "page" in item.position &&
    item.position.page &&
    item.pageCount
  ) {
    return {
      current: item.position.page,
      total: item.pageCount,
      label: `${item.position.page}/${item.pageCount}`,
    };
  }
  // Serie: el numerador son los episodios VISTOS, no `position.episode` — la
  // posición va numerada por temporada (T3E2 -> 2) y el total es el de la serie
  // entera, así que dividir una por otro daba «2/60» a quien iba por la tercera
  // temporada (#715). El rail de la ficha ya contaba así.
  if (item.itemType === "series" && item.watchedEpisodes && item.totalEpisodes) {
    return {
      current: item.watchedEpisodes,
      total: item.totalEpisodes,
      label: `${item.watchedEpisodes}/${item.totalEpisodes}`,
    };
  }
  return null;
}

/**
 * El porcentaje de un pase, para pintarlo. **Nunca redondea hacia arriba hasta
 * 100**: `Math.round((668/669)*100)` da 100, así que un pase al que le quedaba
 * una página se anunciaba como completo — y a treinta píxeles, en el feed, el
 * mismo título aparecía como FINALIZADO. La pantalla se contradecía a sí misma
 * en el instante de mayor atención (crítica de Inicio, 2026-08-27).
 *
 * El 100 se RESERVA para `current >= total`; por debajo se trunca a 99 como
 * mucho, y no baja de 1 habiendo empezado (0 % con avance también es mentira).
 * No es una regla nueva: es la que ya aplicaban `libraryPercent`
 * (derive-person-works.ts) y `deriveWorkProgress` (people/work-progress.ts).
 * Esa última va un paso más allá y tapa el 100 incluso en la última página,
 * porque ahí «terminado» lo dice el ESTADO; aquí no se puede, porque este
 * mismo cálculo pinta también pases ya cerrados (los eventos del feed).
 */
export function passPercent(current: number, total: number): number {
  if (!(total > 0) || current <= 0) return 0;
  if (current >= total) return 100;
  return Math.max(1, Math.min(99, Math.floor((current / total) * 100)));
}
