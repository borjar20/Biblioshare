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
