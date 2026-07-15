"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  episodeExists,
  markEpisodeWatched,
  rollSeriesProgress,
} from "./episode-watch-store";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";

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
    await markEpisodeWatched(supabase, user.id, seriesId, season, episode);
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
  revalidateReadingLog("series", seriesId);
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
  revalidateReadingLog("series", seriesId);
}
