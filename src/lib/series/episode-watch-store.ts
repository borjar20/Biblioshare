import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Escrituras compartidas sobre episode_watches / la posición del pase de una
// serie. Vive en un módulo SIN "use server" a propósito (Tarea 15): son
// helpers internos con un parámetro `supabase` sin serializar, y este
// proyecto reserva los ficheros "use server" para acciones invocables desde
// el cliente (ver src/lib/passes/actions.ts, que por el mismo motivo
// mantiene sus helpers privados). Dos llamantes "use server" distintos
// importan de aquí: episode-actions.ts (pestaña Episodios) y
// sessions/actions.ts (sesión de serie) — así comparten la MISMA escritura
// en vez de duplicarla.

// Comprueba que el episodio existe en el catálogo (evita filas arbitrarias) y
// devuelve true/false. Un episodio siempre debería existir tras el
// cache-as-you-go, pero una server action es un endpoint POST público.
export async function episodeExists(
  supabase: SupabaseServerClient,
  seriesId: string,
  season: number,
  episode: number
): Promise<boolean> {
  const { count } = await supabase
    .from("series_episodes")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId)
    .eq("season_number", season)
    .eq("episode_number", episode);
  return (count ?? 0) > 0;
}

// Escritura pura de la marca "visto" en episode_watches: sin auth ni roll de
// progreso, para poder compartirla entre llamantes que ya tienen su propio
// usuario autenticado y su propio momento de recalcular la posición.
//
// El pase (Tarea 8, hub) es OBLIGATORIO: la unicidad ya no es por
// user+series+season+episode sino por pase (episode_watches_once_per_pass,
// migración 20260717_pass_hub_b2_episode_unique.sql) — un mismo episodio
// puede estar visto en varios pases (revisionado), cada uno con su propia
// fila. El llamante decide a qué pase pertenece la escritura (nunca este
// módulo): resolver o crear el pase activo es responsabilidad suya.
//
// Se comprueba primero y se inserta después (en vez de upsert+onConflict):
// el índice único nuevo es PARCIAL (WHERE pass_id IS NOT NULL) y PostgREST
// solo acepta una lista de columnas en `on_conflict`, sin el predicado —
// Postgres exige que el predicado coincida exactamente para poder inferir un
// índice parcial como árbitro del ON CONFLICT, así que ese camino no sirve
// aquí. Un choque real en la carrera (doble click, dos pestañas) sigue
// protegido por el índice: 23505 se traga igual, como en apply-transition.ts.
export async function markEpisodeWatched(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string,
  passId: string,
  season: number,
  episode: number
): Promise<void> {
  if (!(await episodeExists(supabase, seriesId, season, episode))) return;

  const { data: existing } = await supabase
    .from("episode_watches")
    .select("id")
    .eq("user_id", userId)
    .eq("pass_id", passId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase.from("episode_watches").insert({
    user_id: userId,
    series_id: seriesId,
    pass_id: passId,
    season_number: season,
    episode_number: episode,
  });
  if (error && error.code !== "23505") throw error;
}

// Hace rodar la posición del PASE (Tarea 8, hub) al episodio visto más
// avanzado DE ESE PASE — nunca de todo lo visto por el usuario en la serie:
// un revisionado tiene su propio cursor, así que los vistos de un pase
// anterior (o legado, pass_id null) no deben adelantar ni atrasar este.
// "Solo avanza dentro del pase" sale gratis de la misma consulta: un episodio
// antiguo registrado después nunca hace retroceder el progreso, porque el más
// avanzado ya marcado en ESTE pase sigue estando en la tabla.
//
// Devuelve `reachedEnd`: true si el episodio más avanzado de este pase es el
// último de la serie (última temporada, último episodio) — la señal que usa
// el llamante para encadenar applyTransition(..., "completed") y la hoja de
// cierre, igual que el auto-cierre de libro (§Tarea 7).
export async function rollSeriesProgress(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string,
  passId: string
): Promise<{ reachedEnd: boolean }> {
  // Episodio visto más avanzado DE ESTE PASE (orden temporada, luego episodio).
  const { data: furthest } = await supabase
    .from("episode_watches")
    .select("season_number, episode_number")
    .eq("pass_id", passId)
    .order("season_number", { ascending: false })
    .order("episode_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (furthest) {
    const { error } = await supabase
      .from("passes")
      .update({
        position: {
          season: furthest.season_number,
          episode: furthest.episode_number,
        },
      })
      .eq("id", passId)
      .eq("user_id", userId);
    if (error) throw error;
  }

  // Último episodio del catálogo de la serie (última temporada, último
  // episodio de esa temporada): el listón contra el que se compara el
  // avance de este pase para decidir el auto-cierre.
  const { data: lastEpisode } = await supabase
    .from("series_episodes")
    .select("season_number, episode_number")
    .eq("series_id", seriesId)
    .order("season_number", { ascending: false })
    .order("episode_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reachedEnd =
    furthest !== null &&
    furthest !== undefined &&
    lastEpisode !== null &&
    lastEpisode !== undefined &&
    furthest.season_number === lastEpisode.season_number &&
    furthest.episode_number === lastEpisode.episode_number;

  return { reachedEnd };
}
