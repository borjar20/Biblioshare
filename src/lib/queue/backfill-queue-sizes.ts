import type { createClient } from "@/lib/supabase/server";
import { getMovieDetails, getSeriesDetails } from "@/lib/catalog/tmdb";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Caps how many missing-size items get backfilled per page load, to bound
// load time and TMDB traffic on a large queue — the rest self-heal on a
// later visit. See docs/REQUIREMENTS.md §7.22.
const MAX_BACKFILL_PER_LOAD = 10;

// Lazily backfills movies.duration_minutes / series.total_episodes+seasons+
// episode_runtime_minutes by reusing the TMDB *details* call already made for
// credits/saga (src/lib/people/enrich-item.ts) — that response already
// includes runtime/episode counts, just not previously extracted. Independent
// guard from that function's creditsExist check: only acts on rows still
// missing their own size field. Never throws — an API failure here shouldn't
// break the queue page.
export async function backfillQueueSizes(
  supabase: SupabaseServerClient,
  movies: Array<{ id: string; tmdbId: number | null }>,
  series: Array<{ id: string; tmdbId: number | null }>
): Promise<void> {
  const moviesToFill = movies.filter((m) => m.tmdbId !== null).slice(0, MAX_BACKFILL_PER_LOAD);
  const seriesToFill = series.filter((s) => s.tmdbId !== null).slice(0, MAX_BACKFILL_PER_LOAD);

  await Promise.all([
    ...moviesToFill.map(async (movie) => {
      try {
        const details = await getMovieDetails(movie.tmdbId!);
        if (!details?.runtimeMinutes) return;
        const { error } = await supabase
          .from("movies")
          .update({ duration_minutes: details.runtimeMinutes })
          .eq("id", movie.id);
        if (error) console.error("backfillQueueSizes: movie update failed", { id: movie.id, error });
      } catch (error) {
        console.error("backfillQueueSizes: movie failed", { id: movie.id, error });
      }
    }),
    ...seriesToFill.map(async (item) => {
      try {
        const details = await getSeriesDetails(item.tmdbId!);
        if (!details) return;

        // Recuento y duración de episodio son independientes: TMDB puede traer
        // uno sin el otro, y la estimación de la cola necesita ambos. Se
        // escribe lo que haya en vez de descartar la respuesta entera.
        const patch = {
          ...(details.numberOfEpisodes && {
            total_episodes: details.numberOfEpisodes,
            total_seasons: details.numberOfSeasons,
          }),
          ...(details.episodeRuntimeMinutes && {
            episode_runtime_minutes: details.episodeRuntimeMinutes,
          }),
        };
        if (Object.keys(patch).length === 0) return;

        const { error } = await supabase.from("series").update(patch).eq("id", item.id);
        if (error) console.error("backfillQueueSizes: series update failed", { id: item.id, error });
      } catch (error) {
        console.error("backfillQueueSizes: series failed", { id: item.id, error });
      }
    }),
  ]);
}
