import type { createClient } from "@/lib/supabase/server";
import { airedFlags, isSeriesEnded, todayISO } from "./aired";

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
// que no es un anunciado con fecha futura (#1193): no se puede haber visto lo
// que no se ha emitido. Un episodio siempre debería existir tras el
// cache-as-you-go, pero una server action es un endpoint POST público.
//
// Solo se rechaza la fecha FUTURA explícita. Un episodio sin fecha pasa: la
// regla fina (posición respecto al último emitido, src/lib/series/aired.ts)
// necesitaría el catálogo entero, y la UI ya no ofrece marcar esos; este es el
// guard del endpoint, no la regla de pantalla.
export async function episodeExists(
  supabase: SupabaseServerClient,
  seriesId: string,
  season: number,
  episode: number
): Promise<boolean> {
  const { data } = await supabase
    .from("series_episodes")
    .select("air_date")
    .eq("series_id", seriesId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .maybeSingle();
  if (!data) return false;
  return !data.air_date || data.air_date <= todayISO();
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
  episode: number,
  // Fecha LOCAL del visionado, ya validada (parseWatchedOn). null = el default
  // de la columna (fecha UTC del servidor), el comportamiento de antes.
  watchedOn: string | null = null
): Promise<boolean> {
  if (!(await episodeExists(supabase, seriesId, season, episode))) return false;

  const { data: existing } = await supabase
    .from("episode_watches")
    .select("id")
    .eq("user_id", userId)
    .eq("pass_id", passId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .maybeSingle();
  // Ya estaba visto: no hay progreso NUEVO que registrar. Se devuelve `false`
  // para que el llamante sepa que este gesto no avanzó nada y no dispare el
  // auto-cierre (#716).
  if (existing) return false;

  const { error } = await supabase.from("episode_watches").insert({
    user_id: userId,
    series_id: seriesId,
    pass_id: passId,
    season_number: season,
    episode_number: episode,
    ...(watchedOn && { watched_on: watchedOn }),
  });
  if (error && error.code !== "23505") throw error;
  // 23505 = otra pestaña lo insertó primero: la fila existe, pero no la creó
  // ESTE gesto, así que tampoco cuenta como progreso nuevo.
  return !error;
}

// Catálogo de la serie en orden cronológico con la marca «emitido» ya
// aplicada (regla de src/lib/series/aired.ts) y el estado de TMDB. Lo comparten
// el auto-cierre (rollSeriesProgress) y el marcado masivo (markEpisodesWatched
// en episode-actions.ts): la regla de «qué se puede dar por visto» vive en un
// solo sitio del servidor.
export async function loadAiredCatalog(
  supabase: SupabaseServerClient,
  seriesId: string
): Promise<{
  tmdbStatus: string | null;
  episodes: { season_number: number; episode_number: number; aired: boolean }[];
}> {
  const [{ data: series }, { data: catalog }] = await Promise.all([
    supabase.from("series").select("tmdb_status").eq("id", seriesId).maybeSingle(),
    supabase
      .from("series_episodes")
      .select("season_number, episode_number, air_date")
      .eq("series_id", seriesId)
      .order("season_number", { ascending: true })
      .order("episode_number", { ascending: true }),
  ]);
  const tmdbStatus = series?.tmdb_status ?? null;
  const rows = catalog ?? [];
  const aired = airedFlags(
    rows.map((e) => ({ airDate: e.air_date })),
    todayISO(),
    isSeriesEnded(tmdbStatus)
  );
  return {
    tmdbStatus,
    episodes: rows.map((e, i) => ({
      season_number: e.season_number,
      episode_number: e.episode_number,
      aired: aired[i],
    })),
  };
}

// Escritura en bloque de episodios vistos en un pase (fase 3/4 del rediseño de
// series). La comparten «Marcar temporada / hasta aquí» (markEpisodesWatched) y
// la hoja de sesión de serie (addSession), para que las dos puertas escriban
// igual. El llamante pide QUÉ episodios; aquí se decide cuáles se pueden dar por
// vistos: existen en el catálogo, están EMITIDOS (loadAiredCatalog) y no
// estaban ya vistos en este pase. Un solo insert; si otra pestaña gana la
// carrera (23505) el lote entero se rechaza y se cae a uno a uno, que ya se
// traga el choque fila a fila.
//
// Devuelve si ESTE gesto añadió algo (la señal del auto-cierre, #716).
export async function insertEpisodeWatches(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string,
  passId: string,
  requested: { season: number; episode: number }[],
  watchedOn: string | null
): Promise<boolean> {
  if (requested.length === 0) return false;
  const wanted = new Set(requested.map((e) => `${e.season}:${e.episode}`));
  const [{ episodes: catalog }, { data: already }] = await Promise.all([
    loadAiredCatalog(supabase, seriesId),
    supabase
      .from("episode_watches")
      .select("season_number, episode_number")
      .eq("user_id", userId)
      .eq("pass_id", passId),
  ]);
  const seen = new Set((already ?? []).map((w) => `${w.season_number}:${w.episode_number}`));
  const rows = catalog
    .filter((e) => e.aired)
    .filter((e) => wanted.has(`${e.season_number}:${e.episode_number}`))
    .filter((e) => !seen.has(`${e.season_number}:${e.episode_number}`))
    .map((e) => ({
      user_id: userId,
      series_id: seriesId,
      pass_id: passId,
      season_number: e.season_number,
      episode_number: e.episode_number,
      ...(watchedOn && { watched_on: watchedOn }),
    }));
  if (rows.length === 0) return false;

  const { error } = await supabase.from("episode_watches").insert(rows);
  if (!error) return true;
  if (error.code !== "23505") throw error;
  let added = false;
  for (const r of rows) {
    if (
      await markEpisodeWatched(
        supabase,
        userId,
        seriesId,
        passId,
        r.season_number,
        r.episode_number,
        watchedOn
      )
    )
      added = true;
  }
  return added;
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
// último EMITIDO de una serie terminada o sin estado de TMDB (ver abajo) — la señal que usa
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

  if (!furthest) return { reachedEnd: false };

  // Catálogo vivo (#1193): el listón del auto-cierre ya no es el último
  // episodio del catálogo —que puede ser un anunciado sin emitir— sino el
  // último EMITIDO. Y una serie que TMDB da por en emisión no se cierra sola
  // nunca: haber visto todo lo que hay no es haberla terminado (en la fase 2 de
  // la spec eso será el estado «Al día»). Sin estado de TMDB (serie manual o
  // aún sin sincronizar) se mantiene el criterio de siempre sobre lo emitido.
  const { tmdbStatus, episodes } = await loadAiredCatalog(supabase, seriesId);
  if (tmdbStatus !== null && !isSeriesEnded(tmdbStatus)) return { reachedEnd: false };

  const lastAired = [...episodes].reverse().find((e) => e.aired);

  const reachedEnd =
    lastAired !== undefined &&
    furthest.season_number === lastAired.season_number &&
    furthest.episode_number === lastAired.episode_number;

  return { reachedEnd };
}
