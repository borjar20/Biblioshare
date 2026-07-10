import type { createClient } from "@/lib/supabase/server";
import { getSeriesEpisodes, getSeriesDetails } from "@/lib/catalog/tmdb";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// "Cache-as-you-go" (§7.x, mismo patrón que ensureItemEnriched): la primera vez
// que se abre la ficha de una serie se traen sus episodios de TMDB y se
// persisten en series_episodes; las siguientes visitas leen solo de la BD. Se
// protege con un guard de existencia y NUNCA lanza: un fallo de API externa no
// debe romper la ficha.
export async function ensureSeriesEpisodes(
  supabase: SupabaseServerClient,
  series: { id: string; tmdbId?: number | null; totalSeasons?: number | null }
): Promise<void> {
  try {
    if (!series.tmdbId) return;

    const { count } = await supabase
      .from("series_episodes")
      .select("id", { count: "exact", head: true })
      .eq("series_id", series.id);
    if ((count ?? 0) > 0) return;

    // La fila de catálogo recién creada por la búsqueda no trae total_seasons
    // (se rellena con backfill perezoso más tarde). Resolvemos el número de
    // temporadas desde TMDB para no depender de ese backfill.
    let totalSeasons = series.totalSeasons ?? null;
    if (!totalSeasons) {
      const details = await getSeriesDetails(series.tmdbId);
      totalSeasons = details?.numberOfSeasons ?? null;
    }
    if (!totalSeasons) return;

    const episodes = await getSeriesEpisodes(series.tmdbId, totalSeasons);
    if (episodes.length === 0) return;

    const rows = episodes.map((ep) => ({
      series_id: series.id,
      season_number: ep.seasonNumber,
      episode_number: ep.episodeNumber,
      title: ep.title,
      synopsis: ep.synopsis,
      still_url: ep.stillUrl,
      air_date: ep.airDate,
      runtime_minutes: ep.runtimeMinutes,
    }));

    const { error } = await supabase.from("series_episodes").insert(rows);
    // 23505 = enriquecimiento concurrente (otro render insertó ya estos
    // episodios); esperado e inocuo. Cualquier otro error sí se registra.
    if (error && error.code !== "23505") {
      console.error("series_episodes insert failed", {
        id: series.id,
        count: rows.length,
        error,
      });
    }
  } catch (error) {
    console.error("ensureSeriesEpisodes failed", { id: series.id, error });
  }
}
