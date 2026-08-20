"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import { getActivePass, isAutoCloseable } from "@/lib/passes/get-passes";
import { applyTransition } from "@/lib/passes/apply-transition";
import {
  episodeExists,
  markEpisodeWatched,
  rollSeriesProgress,
} from "./episode-watch-store";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Resuelve el pase de la serie sobre el que escribe la pestaña Episodios.
// Sin pase activo (la serie no está en tu biblioteca todavía) crea uno —
// mismo comportamiento implícito que el viejo rollSeriesProgress ("crea la
// entrada si no existía"), solo que ahora pasa por la máquina de estados
// (applyTransition), nunca por un insert directo. Si el pase seguía
// "planificado", marcar un episodio es la primera escritura real: lo mueve a
// "en curso" (igual que la rama serie de addSession en sessions/actions.ts).
// Un pase ya cerrado (completado/dejado) NO se reabre aquí — eso es una
// decisión explícita del usuario vía StatusSegments (updateStatus), no un
// efecto secundario de marcar una casilla; se escribe en el pase activo tal
// cual esté.
async function ensureWritablePass(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string
): Promise<string> {
  const active = await getActivePass(supabase, "series", seriesId, userId);
  if (!active) {
    const outcome = await applyTransition(supabase, userId, "series", seriesId, "in_progress");
    // planTransition solo devuelve "askResume" al retomar un pase "dropped"
    // (resume sin decidir); sin pase activo previo eso no puede pasar — pero
    // el tipo es una unión y TypeScript no lo sabe sin este narrowing.
    if (outcome.kind === "askResume") {
      throw new Error("unexpected askResume creating a series pass with no active pass");
    }
    return outcome.passId;
  }
  if (active.status === "planned") {
    await applyTransition(supabase, userId, "series", seriesId, "in_progress");
  }
  return active.id;
}

// Tras marcar/desmarcar o puntuar, hace rodar el cursor del pase y encadena
// el auto-cierre (idéntico al de la sesión, §Tarea 7/8): si el episodio más
// avanzado de ESTE pase es el último de la serie, el pase se completa solo
// y la ficha abre la hoja de cierre al volver.
//
// Dos guardas, ambas de #716 — `reachedEnd` solo dice «el más avanzado de este
// pase es el último del catálogo», y eso sigue siendo cierto DESPUÉS de cerrar:
//
//   - `addedProgress`: el auto-cierre solo se dispara si ESTE gesto añadió un
//     episodio nuevo. Sin esto, desmarcar un episodio intermedio teniendo el
//     final visto —o puntuar el final ya visto— volvía a cerrar el pase.
//   - `isAutoCloseable`: nunca sobre un pase `dropped` o `completed`. Abandonar
//     una serie es una decisión del usuario; puntuar un episodio no la deshace.
async function rollAndMaybeClose(
  supabase: SupabaseServerClient,
  userId: string,
  seriesId: string,
  passId: string,
  addedProgress: boolean
): Promise<void> {
  const { reachedEnd } = await rollSeriesProgress(supabase, userId, seriesId, passId);
  revalidateReadingLog("series", seriesId);
  if (!reachedEnd || !addedProgress) return;
  if (!(await isAutoCloseable(supabase, passId, userId))) return;

  await applyTransition(supabase, userId, "series", seriesId, "completed");
  revalidateReadingLog("series", seriesId);
  redirect(`${itemHref("series", seriesId)}?cerrar=${passId}&tab=log`);
}

// Marca / desmarca un episodio como visto EN EL PASE ACTIVO. Marcar no pisa
// una nota/reseña ya existente de OTRO pase (fila propia por pase); desmarcar
// borra solo la fila de este pase — los vistos de pases anteriores (o
// legados, sin pase) no se tocan: son la capa "visto alguna vez" de la
// pestaña Episodios. Ver §7.x.
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

  const passId = await ensureWritablePass(supabase, user.id, seriesId);

  let addedProgress = false;
  if (watched) {
    addedProgress = await markEpisodeWatched(
      supabase,
      user.id,
      seriesId,
      passId,
      season,
      episode,
    );
    // Marcar un episodio no avisa a nadie: el aviso lo emitiría un post
    // kind='watched', y hoy NADIE crea posts de ese kind (no existe «compartir
    // episodio»). Ver issue #626 (github.com/borjar20/Biblioshare).
  } else {
    const { error } = await supabase
      .from("episode_watches")
      .delete()
      .eq("user_id", user.id)
      .eq("pass_id", passId)
      .eq("season_number", season)
      .eq("episode_number", episode);
    if (error) throw error;
  }

  // Desmarcar NUNCA cierra: `addedProgress` se queda en false.
  await rollAndMaybeClose(supabase, user.id, seriesId, passId, addedProgress);
}

// Pone (o actualiza) nota y/o reseña de un episodio EN EL PASE ACTIVO.
// Puntuar implica visto. rating null limpia la nota conservando la fila
// (sigue visto). Ver §7.x.
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

  const passId = await ensureWritablePass(supabase, user.id, seriesId);
  const cleanReview = review?.trim() || null;

  const { data: existing } = await supabase
    .from("episode_watches")
    .select("id")
    .eq("user_id", user.id)
    .eq("pass_id", passId)
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
      pass_id: passId,
      season_number: season,
      episode_number: episode,
      rating,
      review: cleanReview,
    });
    if (error) throw error;
  }

  // Puntuar un episodio YA visto no es progreso: solo cuenta si la puntuación
  // acaba de crear la fila (puntuar implica visto).
  await rollAndMaybeClose(supabase, user.id, seriesId, passId, !existing);
}
