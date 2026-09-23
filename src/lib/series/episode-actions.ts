"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import { getActivePass, isAutoCloseable } from "@/lib/passes/get-passes";
import { applyTransition } from "@/lib/passes/apply-transition";
import {
  episodeExists,
  loadAiredCatalog,
  markEpisodeWatched,
  rollSeriesProgress,
} from "./episode-watch-store";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";
import { parseWatchedOn } from "./watched-on";
import { earnDailyLoopCelebrations } from "@/lib/celebrations/earn";

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
  // Ver un episodio es actividad del día (fase 4, D3): primera actividad,
  // hito de racha. Antes solo lo ganaba la hoja de sesión. Best-effort: nunca
  // lanza. El cliente lo drena con checkCelebrations().
  if (addedProgress) await earnDailyLoopCelebrations(supabase, userId);
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
  watched: boolean,
  // Fecha LOCAL del cliente (YYYY-MM-DD); sin ella, la del servidor.
  watchedOn?: string
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
      parseWatchedOn(watchedOn),
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

// Tope de episodios por llamada: es un endpoint POST público y la serie más
// larga del catálogo ronda los 1.900 (Doraemon); con esto cabe cualquier
// «marcar hasta aquí» real y un cliente malicioso no fabrica un insert enorme.
const MAX_BULK_EPISODES = 2500;

// Marcado masivo (fase 3 del rediseño de series): «Marcar temporada vista» y
// «Vistos hasta aquí». El cliente dice QUÉ episodios; el servidor decide cuáles
// se pueden dar por vistos — solo los que existen en el catálogo, están
// EMITIDOS (loadAiredCatalog, misma regla que el auto-cierre) y no estaban ya
// vistos en este pase. Un solo insert en vez de N llamadas a setEpisodeWatched:
// con 60 episodios eran 60 viajes de ida y vuelta y 60 recálculos del cursor.
//
// El cierre automático se evalúa UNA vez, al final, igual que en la hoja de
// sesión: si el lote llega al último emitido de una serie terminada, se cierra.
export async function markEpisodesWatched(
  seriesId: string,
  episodes: { season: number; episode: number }[],
  watchedOn?: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!Array.isArray(episodes) || episodes.length === 0) return;
  if (episodes.length > MAX_BULK_EPISODES) return;
  const requested = new Set<string>();
  for (const e of episodes) {
    if (!Number.isInteger(e?.season) || !Number.isInteger(e?.episode)) return;
    requested.add(`${e.season}:${e.episode}`);
  }

  const passId = await ensureWritablePass(supabase, user.id, seriesId);
  const day = parseWatchedOn(watchedOn);

  const [{ episodes: catalog }, { data: already }] = await Promise.all([
    loadAiredCatalog(supabase, seriesId),
    supabase
      .from("episode_watches")
      .select("season_number, episode_number")
      .eq("user_id", user.id)
      .eq("pass_id", passId),
  ]);
  const seen = new Set((already ?? []).map((w) => `${w.season_number}:${w.episode_number}`));
  const rows = catalog
    .filter((e) => e.aired)
    .filter((e) => requested.has(`${e.season_number}:${e.episode_number}`))
    .filter((e) => !seen.has(`${e.season_number}:${e.episode_number}`))
    .map((e) => ({
      user_id: user.id,
      series_id: seriesId,
      pass_id: passId,
      season_number: e.season_number,
      episode_number: e.episode_number,
      ...(day && { watched_on: day }),
    }));

  let added = false;
  if (rows.length > 0) {
    const { error } = await supabase.from("episode_watches").insert(rows);
    if (!error) added = true;
    else if (error.code === "23505") {
      // Otra pestaña marcó alguno entre la lectura y el insert: el lote entero
      // se rechaza, así que se cae a la escritura de uno en uno, que ya se traga
      // el choque fila a fila (markEpisodeWatched).
      for (const r of rows) {
        if (
          await markEpisodeWatched(
            supabase,
            user.id,
            seriesId,
            passId,
            r.season_number,
            r.episode_number,
            day
          )
        )
          added = true;
      }
    } else throw error;
  }

  await rollAndMaybeClose(supabase, user.id, seriesId, passId, added);
}

// Pone (o actualiza) nota y/o reseña de un episodio EN EL PASE ACTIVO.
// Puntuar implica visto. rating null limpia la nota conservando la fila
// (sigue visto). Ver §7.x.
export async function rateEpisode(
  seriesId: string,
  season: number,
  episode: number,
  rating: number | null,
  review: string | null,
  // Solo cuenta si puntuar CREA la fila (puntuar implica visto): una nota
  // sobre un episodio ya visto no le cambia la fecha.
  watchedOn?: string
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
  const day = parseWatchedOn(watchedOn);

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
      ...(day && { watched_on: day }),
    });
    if (error) throw error;
  }

  // Puntuar un episodio YA visto no es progreso: solo cuenta si la puntuación
  // acaba de crear la fila (puntuar implica visto).
  await rollAndMaybeClose(supabase, user.id, seriesId, passId, !existing);
}
