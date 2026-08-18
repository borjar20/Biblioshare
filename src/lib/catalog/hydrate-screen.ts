import type { createClient } from "@/lib/supabase/server";
import { getMovieForHydration, getSeriesForHydration } from "./tmdb";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HydratableScreen = {
  id: string;
  tmdb_id: number | null;
  hydrated_at: string | null;
};

// Hermano de ensureBookHydrated (hydrate-book.ts): idempotente, guarded por
// hydrated_at, y NUNCA lanza. La primera apertura de ficha trae del proveedor los
// campos canónicos y los escribe por la RPC definer (autoritativa si la fila no
// estaba hidratada, fill-only si ya lo estaba). #674.
export async function ensureMovieHydrated(
  supabase: SupabaseServerClient,
  movie: HydratableScreen
): Promise<void> {
  try {
    if (movie.hydrated_at !== null) return;
    if (!movie.tmdb_id) {
      await markHydrated(supabase, "movies", movie.id);
      return;
    }
    const d = await getMovieForHydration(movie.tmdb_id);
    if (!d) return; // API falló: no marcar, reintentar en la próxima visita.

    const { error } = await supabase.rpc("hydrate_movie", {
      p_movie_id: movie.id,
      p_title: d.title ?? undefined,
      p_original_title: d.originalTitle ?? undefined,
      p_director: d.director ?? undefined,
      p_synopsis: d.synopsis ?? undefined,
      p_genres: d.genres && d.genres.length > 0 ? d.genres : undefined,
      p_release_year: d.year ?? undefined,
      p_cover_url: d.coverUrl ?? undefined,
      p_duration_minutes: d.durationMinutes ?? undefined,
    });
    if (error) console.error("hydrate_movie rpc failed", { movieId: movie.id, error });
  } catch (error) {
    console.error("ensureMovieHydrated failed", { movieId: movie.id, error });
  }
}

export async function ensureSeriesHydrated(
  supabase: SupabaseServerClient,
  series: HydratableScreen
): Promise<void> {
  try {
    if (series.hydrated_at !== null) return;
    if (!series.tmdb_id) {
      await markHydrated(supabase, "series", series.id);
      return;
    }
    const d = await getSeriesForHydration(series.tmdb_id);
    if (!d) return;

    const { error } = await supabase.rpc("hydrate_series", {
      p_series_id: series.id,
      p_title: d.title ?? undefined,
      p_original_title: d.originalTitle ?? undefined,
      p_creator: d.creator ?? undefined,
      p_synopsis: d.synopsis ?? undefined,
      p_genres: d.genres && d.genres.length > 0 ? d.genres : undefined,
      p_release_year: d.year ?? undefined,
      p_cover_url: d.coverUrl ?? undefined,
      p_total_seasons: d.totalSeasons ?? undefined,
      p_total_episodes: d.totalEpisodes ?? undefined,
      p_episode_runtime_minutes: d.episodeRuntimeMinutes ?? undefined,
    });
    if (error) console.error("hydrate_series rpc failed", { seriesId: series.id, error });
  } catch (error) {
    console.error("ensureSeriesHydrated failed", { seriesId: series.id, error });
  }
}

async function markHydrated(
  supabase: SupabaseServerClient,
  table: "movies" | "series",
  id: string
): Promise<void> {
  await supabase.from(table).update({ hydrated_at: new Date().toISOString() }).eq("id", id);
}
