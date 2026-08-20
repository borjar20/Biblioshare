import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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

    // #676: el número de temporadas se pregunta SIEMPRE a TMDB, nunca se cree
    // el de la fila de catálogo. `series.totalSeasons` es un dato COMPARTIDO y
    // escribible (lo rellena la hidratación), y aquí decide cuántas peticiones
    // salen: usarlo como fuente convertía cualquier valor absurdo en el
    // multiplicador de un fan-out. La llamada extra no cuesta nada real —
    // `getSeriesDetails` va por `tmdbGet`, cacheada 24 h por Next, y este camino
    // solo corre la PRIMERA vez que se abre la serie (guard de `count` arriba).
    // Antes solo se preguntaba a TMDB cuando la fila venía sin dato.
    const details = await getSeriesDetails(series.tmdbId);
    const fromTmdb = details?.numberOfSeasons ?? null;
    if (!fromTmdb || fromTmdb <= 0) return;
    const totalSeasons = fromTmdb;

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

    // #725: la escritura va con service_role, no con el cliente de la petición.
    // `series_episodes` es catálogo GLOBAL y su INSERT estaba abierto a
    // cualquier `authenticated` con `with check (true)`: se podían inventar
    // episodios que veía todo el mundo. Mismo argumento que las sagas TMDB
    // (`persist-collection.ts`): estas filas las deriva el SERVIDOR de TMDB —
    // `rows` no lleva ni un dato que venga del cliente, solo el id de la serie y
    // lo que devolvió la API—, así que el hecho lo respalda el servidor y la
    // tabla puede quedar cerrada a la sesión del usuario.
    //
    // La lectura de arriba (el guard de `count`) se queda con el cliente de la
    // petición a propósito: leer catálogo es público y no hace falta saltarse
    // nada para contarlo.
    const { error } = await createServiceRoleClient().from("series_episodes").insert(rows);
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
