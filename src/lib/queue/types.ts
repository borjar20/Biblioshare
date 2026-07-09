import type { ItemType } from "@/lib/catalog/types";

// A "planned" library item, as shown in the priority queue (§7.22).
export type QueueItem = {
  entryId: string;
  itemId: string;
  itemType: ItemType;
  queueOrder: number;
  title: string;
  coverUrl: string | null;
  subtitle: string | null; // author, books only
  totalPages: number | null; // books only
  durationMinutes: number | null; // movies only
  totalEpisodes: number | null; // series only
  tmdbId: number | null; // movies/series only, for the size backfill
};

export type ItemEstimate = {
  minutes: number | null;
  formulaText: string;
};

export type QueueEstimates = {
  perItem: Record<string, ItemEstimate>; // keyed by entryId
  totalMinutes: number;
  totalText: string;
  unresolvedCount: number;
  moviePaceText: string | null;
};
