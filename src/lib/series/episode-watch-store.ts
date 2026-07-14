import type { createClient } from "@/lib/supabase/server";
import type { MediaStatus } from "@/lib/library/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Escrituras compartidas sobre episode_watches / la posición de una entrada
// de serie. Vive en un módulo SIN "use server" a propósito (Tarea 15): son
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
export async function markEpisodeWatched(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string,
  season: number,
  episode: number
): Promise<void> {
  if (!(await episodeExists(supabase, seriesId, season, episode))) return;
  const { error } = await supabase.from("episode_watches").upsert(
    {
      user_id: userId,
      series_id: seriesId,
      season_number: season,
      episode_number: episode,
    },
    {
      onConflict: "user_id,series_id,season_number,episode_number",
      ignoreDuplicates: true,
    }
  );
  if (error) throw error;
}

// Asegura que el usuario sigue la serie (crea la entrada si no existía, como
// addExistingItemToLibrary) y hace rodar su posición al episodio visto más
// avanzado. Si la serie estaba "planned", pasa a "in_progress".
//
// La posición de la entrada SIEMPRE se deriva de episode_watches (el episodio
// más avanzado de TODO lo marcado, venga de la pestaña Episodios o de una
// sesión) — nunca se escribe a mano, así que "solo avanza" sale gratis de
// esta consulta: un episodio antiguo registrado después nunca hace retroceder
// el progreso, porque el más avanzado ya marcado sigue estando en la tabla.
export async function rollSeriesProgress(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string
): Promise<void> {
  // Entrada de biblioteca (créala si hace falta).
  const { data: entry } = await supabase
    .from("library_entries")
    .select("id, status")
    .eq("user_id", userId)
    .eq("item_type", "series")
    .eq("item_id", seriesId)
    .maybeSingle();

  if (!entry) {
    const { error } = await supabase.from("library_entries").insert({
      user_id: userId,
      item_type: "series",
      item_id: seriesId,
      status: "in_progress",
    });
    if (error && error.code !== "23505") throw error;
  }

  // Episodio visto más avanzado (orden temporada, luego episodio).
  const { data: furthest } = await supabase
    .from("episode_watches")
    .select("season_number, episode_number")
    .eq("user_id", userId)
    .eq("series_id", seriesId)
    .order("season_number", { ascending: false })
    .order("episode_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const update: {
    position?: { season: number; episode: number };
    status?: MediaStatus;
    queue_id?: null;
    queue_order?: null;
  } = {};
  if (furthest) {
    update.position = {
      season: furthest.season_number,
      episode: furthest.episode_number,
    };
  }
  // Salir de "planned" al empezar a ver: mismo saneado de cola que updateStatus.
  if (entry?.status === "planned") {
    update.status = "in_progress";
    update.queue_id = null;
    update.queue_order = null;
  }

  if (Object.keys(update).length > 0) {
    await supabase
      .from("library_entries")
      .update(update)
      .eq("user_id", userId)
      .eq("item_type", "series")
      .eq("item_id", seriesId);
  }
}
