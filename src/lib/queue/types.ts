import type { ItemType } from "@/lib/catalog/types";

// A named priority queue (§7.22). A planned library item belongs to at most
// one; items with no queue live in the implicit "Sin cola" bucket.
export type Queue = {
  id: string;
  name: string;
  position: number;
};

// A "planned" library item, as shown in the priority queue (§7.22).
export type QueueItem = {
  entryId: string;
  itemId: string;
  itemType: ItemType;
  queueId: string | null;
  queueOrder: number;
  title: string;
  coverUrl: string | null;
  subtitle: string | null; // author, books only
  totalPages: number | null; // books only
  durationMinutes: number | null; // movies only
  totalEpisodes: number | null; // series only
  episodeRuntimeMinutes: number | null; // series only
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
