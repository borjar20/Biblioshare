import type { ItemType } from "@/lib/catalog/types";
import type { Challenge } from "./types";

// A completed item, normalized so the matcher is pure and testable: a finished
// diary entry plus enough catalog context (genres, saga memberships) to decide
// whether it counts toward a challenge. See docs/REQUIREMENTS.md §7.10.
export type CompletedItem = {
  itemType: ItemType;
  itemId: string;
  finishedOn: string; // "YYYY-MM-DD"
  genres: string[];
  sagaIds: string[];
};

// Does one completed item count toward this challenge? A challenge with no type
// and empty criteria counts everything finished in its window. Criteria are
// ANDed: a genre-and-saga challenge needs both to match. String comparisons for
// genre are case-insensitive so "Ciencia ficción" matches whatever casing the
// catalog stored.
export function itemMatchesChallenge(item: CompletedItem, challenge: Challenge): boolean {
  if (item.finishedOn < challenge.startDate || item.finishedOn > challenge.endDate) {
    return false;
  }
  if (challenge.itemType && item.itemType !== challenge.itemType) return false;

  const { genre, sagaId } = challenge.criteria;
  if (genre) {
    const wanted = genre.toLowerCase();
    if (!item.genres.some((g) => g.toLowerCase() === wanted)) return false;
  }
  if (sagaId && !item.sagaIds.includes(sagaId)) return false;

  return true;
}

// Number of completed items that count toward the challenge. A single item is
// counted at most once even if finished multiple times isn't modelled here —
// each CompletedItem is one finish; de-duping (if ever wanted) belongs upstream.
export function countForChallenge(items: CompletedItem[], challenge: Challenge): number {
  return items.reduce((n, item) => (itemMatchesChallenge(item, challenge) ? n + 1 : n), 0);
}
