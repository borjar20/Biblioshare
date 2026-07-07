import type { ItemType } from "@/lib/catalog/types";

export type BookPosition = { page: number };
export type SeriesPosition = { season: number; episode: number };
export type MoviePosition = Record<string, never>;

export type Position = BookPosition | SeriesPosition | MoviePosition;

// `library_entries.position` is untyped JSONB in the DB (see docs/REQUIREMENTS.md
// §3.2) — this is the single place that interprets its shape per item type.
export function parsePosition(itemType: ItemType, raw: unknown): Position {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  if (itemType === "book") {
    const page = Number(value.page);
    return Number.isFinite(page) && page >= 0 ? { page } : {};
  }

  if (itemType === "series") {
    const season = Number(value.season);
    const episode = Number(value.episode);
    return Number.isFinite(season) && Number.isFinite(episode) && season >= 0 && episode >= 0
      ? { season, episode }
      : {};
  }

  return {};
}

export function formatPosition(itemType: ItemType, position: Position): string | null {
  if (itemType === "book" && "page" in position) {
    return `Pág. ${position.page}`;
  }
  if (itemType === "series" && "season" in position) {
    return `T${position.season}E${position.episode}`;
  }
  return null;
}
