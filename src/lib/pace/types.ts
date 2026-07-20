import type { ItemType } from "@/lib/catalog/types";

// Un ítem al que se le puede estimar el tiempo que queda, con los metadatos de
// catálogo ya resueltos. Nació como `QueueItem` de la cola priorizada (§7.22);
// al retirarse las colas (2026-07-20) su único consumidor es el sorteo (§7.28),
// que lo necesita para el filtro de duración. Perdió por el camino `queueId` y
// `queueOrder`, que ya no significaban nada y se rellenaban de relleno.
export type EstimableItem = {
  entryId: string;
  itemId: string;
  itemType: ItemType;
  title: string;
  coverUrl: string | null;
  subtitle: string | null; // author, books only
  totalPages: number | null; // books only
  durationMinutes: number | null; // movies only
  totalEpisodes: number | null; // series only
  episodeRuntimeMinutes: number | null; // series only
  tmdbId: number | null; // movies/series only, para el backfill de tamaños
};

export type ItemEstimate = {
  minutes: number | null;
  formulaText: string;
};

export type PaceEstimates = {
  perItem: Record<string, ItemEstimate>; // keyed by entryId
  totalMinutes: number;
  totalText: string;
  unresolvedCount: number;
  moviePaceText: string | null;
};
