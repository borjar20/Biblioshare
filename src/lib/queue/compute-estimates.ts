import type { QueueItem, ItemEstimate, QueueEstimates } from "./types";
import type { BookPace, SeriesPace } from "./get-reading-pace";
import type { MoviePace } from "./get-movie-cadence";
import { formatDuration } from "./format-duration";

// Pure — no I/O. Builds a per-item, transparent formula string alongside the
// numeric estimate (docs/REQUIREMENTS.md §7.22: show the calculation, don't
// hide it behind a model). Items without enough data are excluded from the
// total but counted separately, never silently dropped.
export function computeQueueEstimates(
  items: QueueItem[],
  bookPace: BookPace,
  seriesPace: SeriesPace,
  moviePace: MoviePace
): QueueEstimates {
  const perItem: Record<string, ItemEstimate> = {};
  let totalMinutes = 0;
  let unresolvedCount = 0;

  for (const item of items) {
    const estimate = estimateItem(item, bookPace, seriesPace);
    perItem[item.entryId] = estimate;
    if (estimate.minutes !== null) totalMinutes += estimate.minutes;
    else unresolvedCount += 1;
  }

  return {
    perItem,
    totalMinutes,
    totalText:
      totalMinutes > 0
        ? `~${formatDuration(totalMinutes)} a tu ritmo actual`
        : "Todavía no hay datos suficientes para estimar tu cola",
    unresolvedCount,
    moviePaceText: moviePace
      ? `Ves ~${moviePace.moviesPerWeek.toFixed(1)} películas/semana`
      : null,
  };
}

function estimateItem(item: QueueItem, bookPace: BookPace, seriesPace: SeriesPace): ItemEstimate {
  if (item.itemType === "book") {
    if (!item.totalPages) return { minutes: null, formulaText: "Nº de páginas desconocido" };
    if (!bookPace) return { minutes: null, formulaText: "Sin datos suficientes de ritmo todavía" };

    const minutes = item.totalPages / bookPace.pagesPerMinute;
    return {
      minutes,
      formulaText: `${item.totalPages} páginas ÷ ${bookPace.pagesPerMinute.toFixed(2)} páginas/min (últimas ${bookPace.sampleCount} sesiones) ≈ ${formatDuration(minutes)}`,
    };
  }

  if (item.itemType === "series") {
    if (!item.totalEpisodes) return { minutes: null, formulaText: "Nº de episodios desconocido" };
    if (!seriesPace) return { minutes: null, formulaText: "Sin datos suficientes de ritmo todavía" };

    const minutes = item.totalEpisodes * seriesPace.minutesPerEpisode;
    return {
      minutes,
      formulaText: `${item.totalEpisodes} episodios × ${seriesPace.minutesPerEpisode.toFixed(1)} min/episodio (últimas ${seriesPace.sampleCount} sesiones) ≈ ${formatDuration(minutes)}`,
    };
  }

  if (!item.durationMinutes) return { minutes: null, formulaText: "Duración desconocida" };
  return { minutes: item.durationMinutes, formulaText: `Duración: ${formatDuration(item.durationMinutes)}` };
}
