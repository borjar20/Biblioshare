"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { MediaStatus } from "@/lib/library/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Los cambios por episodio afectan a la ficha, al perfil (progreso / "Ahora
// mismo") y a la home — igual que las sesiones (src/lib/sessions/actions.ts).
function revalidateSeriesViews(seriesId: string) {
  revalidatePath(itemHref("series", seriesId));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

// Comprueba que el episodio existe en el catálogo (evita filas arbitrarias) y
// devuelve true/false. Un episodio siempre debería existir tras el
// cache-as-you-go, pero una server action es un endpoint POST público.
async function episodeExists(
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

// Asegura que el usuario sigue la serie (crea la entrada si no existía, como
// addExistingItemToLibrary) y hace rodar su posición al episodio visto más
// avanzado. Si la serie estaba "planned", pasa a "in_progress".
async function rollSeriesProgress(
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

// Marca / desmarca un episodio como visto. Marcar no pisa una nota/reseña ya
// existente; desmarcar borra la fila (y con ella su nota/reseña). Ver §7.x.
export async function setEpisodeWatched(
  seriesId: string,
  season: number,
  episode: number,
  watched: boolean
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (watched) {
    if (!(await episodeExists(supabase, seriesId, season, episode))) return;
    const { error } = await supabase.from("episode_watches").upsert(
      {
        user_id: user.id,
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
  } else {
    const { error } = await supabase
      .from("episode_watches")
      .delete()
      .eq("user_id", user.id)
      .eq("series_id", seriesId)
      .eq("season_number", season)
      .eq("episode_number", episode);
    if (error) throw error;
  }

  await rollSeriesProgress(supabase, user.id, seriesId);
  revalidateSeriesViews(seriesId);
}

// Pone (o actualiza) nota y/o reseña de un episodio. Puntuar implica visto.
// rating null limpia la nota conservando la fila (sigue visto). Ver §7.x.
export async function rateEpisode(
  seriesId: string,
  season: number,
  episode: number,
  rating: number | null,
  review: string | null
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
    return;
  }
  if (!(await episodeExists(supabase, seriesId, season, episode))) return;

  const cleanReview = review?.trim() || null;

  const { data: existing } = await supabase
    .from("episode_watches")
    .select("id")
    .eq("user_id", user.id)
    .eq("series_id", seriesId)
    .eq("season_number", season)
    .eq("episode_number", episode)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("episode_watches")
      .update({ rating, review: cleanReview, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("episode_watches").insert({
      user_id: user.id,
      series_id: seriesId,
      season_number: season,
      episode_number: episode,
      rating,
      review: cleanReview,
    });
    if (error) throw error;
  }

  await rollSeriesProgress(supabase, user.id, seriesId);
  revalidateSeriesViews(seriesId);
}
