import type { ItemType } from "@/lib/catalog/types";

// The physical/edition format of *your copy* of a book — not a property of
// the work, so it lives here (per-user position) rather than in `books`
// (shared catalog). See docs/REQUIREMENTS.md §7.1.
export type BookFormat = "paperback" | "softcover" | "hardcover";
export const BOOK_FORMATS: BookFormat[] = ["paperback", "softcover", "hardcover"];

export type BookPosition = { page?: number; format?: BookFormat };
export type SeriesPosition = { season: number; episode: number };
export type MoviePosition = Record<string, never>;

export type Position = BookPosition | SeriesPosition | MoviePosition;

// `library_entries.position` is untyped JSONB in the DB (see docs/REQUIREMENTS.md
// §3.2) — this is the single place that interprets its shape per item type.
export function parsePosition(itemType: ItemType, raw: unknown): Position {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  if (itemType === "book") {
    const page = Number(value.page);
    const format = BOOK_FORMATS.includes(value.format as BookFormat)
      ? (value.format as BookFormat)
      : undefined;
    const position: BookPosition = {};
    if (Number.isFinite(page) && page >= 0) position.page = page;
    if (format) position.format = format;
    return position;
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
  if (itemType === "book") {
    const parts: string[] = [];
    if ("page" in position && position.page !== undefined) {
      parts.push(`Pág. ${position.page}`);
    }
    if ("format" in position && position.format) {
      parts.push(BOOK_FORMAT_LABELS[position.format]);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (itemType === "series" && "season" in position) {
    return `T${position.season}E${position.episode}`;
  }
  return null;
}

const BOOK_FORMAT_LABELS: Record<BookFormat, string> = {
  paperback: "Bolsillo",
  softcover: "Tapa blanda",
  hardcover: "Tapa dura",
};
