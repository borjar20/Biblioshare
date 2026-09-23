import { after } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getSeriesEpisodes, getSeriesDetails } from "@/lib/catalog/tmdb";
import {
  airedFlags,
  episodeSyncNeed,
  isSeriesEnded,
  todayISO,
} from "@/lib/series/aired";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SeriesSyncRow = {
  id: string;
  tmdbId?: number | null;
  tmdbStatus?: string | null;
  nextEpisodeAirDate?: string | null;
  episodesSyncedAt?: string | null;
};

// Catálogo vivo de episodios (#1193, spec 2026-09-23-series-flujo-rediseno,
// fase 1). Antes esto era cache-as-you-go puro: se traía de TMDB la primera
// vez y NUNCA más, así que una temporada estrenada después no llegaba jamás.
// Ahora decide `episodeSyncNeed` (src/lib/series/aired.ts):
//
//   - "empty": sin episodios → se traen YA, dentro del render (sin ellos la
//     pestaña Episodios ni existe). Es el camino de siempre.
//   - "stale": la serie sigue en emisión y el catálogo tiene más de 7 días, o
//     ya se estrenó el episodio que estaba anunciado, o es una fila anterior
//     al catálogo vivo → se refresca en `after()`: la visita no espera a
//     TMDB y lo nuevo aparece en la siguiente.
//   - "fresh": nada. Una serie terminada (`Ended`/`Canceled`) ya sincronizada
//     no vuelve a preguntar nunca.
//
// NUNCA lanza: un fallo de API externa no debe romper la ficha.
export async function ensureSeriesEpisodes(
  supabase: SupabaseServerClient,
  series: SeriesSyncRow,
): Promise<void> {
  try {
    const tmdbId = series.tmdbId;
    if (!tmdbId) return;

    // La lectura va con el cliente de la petición a propósito: leer catálogo
    // es público. Solo la ESCRITURA necesita service_role (ver syncSeriesEpisodes).
    const { count, error } = await supabase
      .from("series_episodes")
      .select("id", { count: "exact", head: true })
      .eq("series_id", series.id);
    if (error) return;

    const need = episodeSyncNeed({
      episodeCount: count ?? 0,
      tmdbStatus: series.tmdbStatus ?? null,
      nextEpisodeAirDate: series.nextEpisodeAirDate ?? null,
      episodesSyncedAt: series.episodesSyncedAt ?? null,
    });
    if (need === "fresh") return;
    if (need === "empty") {
      await syncSeriesEpisodes(series.id, tmdbId);
      return;
    }
    // El callback solo usa service_role, nunca el cliente de la petición: ese
    // lee cookies en cada consulta y no puede cruzar a un `after()` (#751).
    after(() => syncSeriesEpisodes(series.id, tmdbId));
  } catch (error) {
    console.error("ensureSeriesEpisodes failed", { id: series.id, error });
  }
}

// Trae de TMDB el estado de la serie y todos sus episodios, y los vuelca en el
// catálogo. Exportada para los tests; el resto de la app entra por
// ensureSeriesEpisodes.
//
// #676: el número de temporadas se pregunta SIEMPRE a TMDB, nunca se cree el de
// la fila de catálogo — decide cuántas peticiones salen, y la fila es un dato
// compartido. `getSeriesDetails` va por `tmdbGet`, cacheada 24 h por Next.
//
// #725: la escritura va con service_role. `series_episodes` es catálogo GLOBAL
// de solo lectura para las sesiones; estas filas las deriva el SERVIDOR de TMDB
// (ni un dato viene del cliente), así que el hecho lo respalda el servidor. Lo
// mismo para las tres columnas de estado de `series` (migración
// 20260923130000_series_live_episode_catalog.sql), que no tienen grant de
// UPDATE para `authenticated`.
export async function syncSeriesEpisodes(seriesId: string, tmdbId: number): Promise<void> {
  try {
    const details = await getSeriesDetails(tmdbId);
    if (!details) return;

    const episodes =
      details.numberOfSeasons && details.numberOfSeasons > 0
        ? await getSeriesEpisodes(tmdbId, details.numberOfSeasons)
        : [];

    const admin = createServiceRoleClient();

    if (episodes.length > 0) {
      const rows = episodes.map((ep) => ({
        series_id: seriesId,
        season_number: ep.seasonNumber,
        episode_number: ep.episodeNumber,
        title: ep.title,
        synopsis: ep.synopsis,
        still_url: ep.stillUrl,
        air_date: ep.airDate,
        runtime_minutes: ep.runtimeMinutes,
      }));
      // Upsert, no insert: en un refresco los episodios ya guardados se
      // ACTUALIZAN (TMDB corrige títulos y, sobre todo, fija la fecha de los
      // anunciados). Los que TMDB haya quitado no se borran: `episode_watches`
      // los referencia por número y un renumerado de TMDB no debe llevarse por
      // delante lo que alguien marcó.
      const { error } = await admin
        .from("series_episodes")
        .upsert(rows, { onConflict: "series_id,season_number,episode_number" });
      if (error) {
        // Sin marcar la sincronización: la próxima visita lo reintenta.
        console.error("series_episodes upsert failed", {
          id: seriesId,
          count: rows.length,
          error,
        });
        return;
      }
    }

    // `total_episodes` pasa a ser «episodios EMITIDOS»: es el denominador del
    // progreso en tarjetas, estadísticas y mascota, y los anunciados no se
    // pueden ver. Sin catálogo (TMDB falló) no se toca lo que hubiera.
    const sorted = [...episodes].sort(
      (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber,
    );
    const aired = airedFlags(sorted, todayISO(), isSeriesEnded(details.status)).filter(
      Boolean,
    ).length;

    const { error: seriesError } = await admin
      .from("series")
      .update({
        tmdb_status: details.status,
        next_episode_air_date: details.nextEpisodeAirDate,
        episodes_synced_at: new Date().toISOString(),
        // El CHECK `series_total_seasons_range` (≤ 200) es un pararrayos; si
        // TMDB lo superase, mejor no tocar la columna que tumbar el update entero.
        ...(episodes.length > 0 && {
          ...(details.numberOfSeasons! <= 200 && { total_seasons: details.numberOfSeasons }),
          ...(aired > 0 && { total_episodes: aired }),
        }),
      })
      .eq("id", seriesId);
    if (seriesError) {
      console.error("series sync state update failed", { id: seriesId, error: seriesError });
    }
  } catch (error) {
    console.error("syncSeriesEpisodes failed", { id: seriesId, error });
  }
}
