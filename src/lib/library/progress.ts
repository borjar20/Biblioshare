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
  if (
    item.itemType === "series" &&
    "episode" in item.position &&
    item.position.episode &&
    item.totalEpisodes
  ) {
    return {
      current: item.position.episode,
      total: item.totalEpisodes,
      label: `${item.position.episode}/${item.totalEpisodes}`,
    };
  }
  return null;
}
