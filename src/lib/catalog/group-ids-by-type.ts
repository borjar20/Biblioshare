import type { ItemType } from "./types";

// Buckets a list of polymorphic (item_type, item_id) refs into per-type id
// arrays — the shape needed to fan out one `.in("id", ids)` query per catalog
// table (books/movies/series). Shared by the queue and challenge readers.
export function groupIdsByType<T extends { itemType: ItemType; itemId: string }>(
  items: T[]
): Record<ItemType, string[]> {
  const byType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const item of items) byType[item.itemType].push(item.itemId);
  return byType;
}
