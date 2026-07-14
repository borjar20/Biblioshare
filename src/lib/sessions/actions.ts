"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { parsePosition, type Position } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getPasses } from "@/lib/passes/get-passes";
import { openPass } from "@/lib/passes/actions";
import { getEditions } from "@/lib/editions/get-editions";
import { primaryEdition } from "@/lib/editions/edition-label";
import {
  markEpisodeWatched,
  rollSeriesProgress,
} from "@/lib/series/episode-watch-store";

const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

// Session writes touch three views: the item detail page, the profile
// (progress bars / "Ahora mismo"), and the home shelf.
function revalidateItemViews(itemType: ItemType, itemId: string) {
  revalidatePath(itemHref(itemType, itemId));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

export type AddSessionState = {
  error?: "invalidPosition" | "invalidDuration" | "generic";
};

// Logs a reading/watching session AND rolls the entry's current state
// forward (position + status) — the session form is the daily-loop way of
// updating progress. See docs/REQUIREMENTS.md §7.14.
export async function addSession(
  entryId: string,
  itemType: ItemType,
  itemId: string,
  _prevState: AddSessionState,
  formData: FormData
): Promise<AddSessionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entry, error: entryError } = await supabase
    .from("library_entries")
    .select("id, position")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (entryError) return { error: "generic" };
  if (!entry) return { error: "generic" };

  const sessionDate = String(formData.get("sessionDate") ?? "").trim();

  // Los minutos son solo de lectura (§7.14): una sesión de serie registra qué
  // episodio alcanzaste, no cuánto tardaste — la duración de una serie es una
  // propiedad del ítem (series.episode_runtime_minutes), no del usuario. El
  // formulario ya no pinta el campo para series, pero una server action es un
  // endpoint POST público: hay que ignorarlo aquí, no confiar en la UI.
  const durationRaw =
    itemType === "book" ? String(formData.get("durationMinutes") ?? "").trim() : "";
  let durationMinutes: number | null = null;
  if (durationRaw) {
    durationMinutes = Number(durationRaw);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
      return { error: "invalidDuration" };
    }
  }

  const note = String(formData.get("note") ?? "").trim();

  // La sesión cuelga del pase abierto de la entrada. Registrar una sesión
  // implica que has empezado: si el ítem seguía "pendiente" y no hay ningún
  // pase abierto, lo abrimos aquí mismo en vez de exigir que el usuario
  // cambie el estado primero.
  let passes = await getPasses(supabase, entryId);
  let currentOpenPass = passes.find((p) => !p.finishedOn) ?? null;
  if (!currentOpenPass) {
    await openPass(entryId, null);
    passes = await getPasses(supabase, entryId);
    currentOpenPass = passes.find((p) => !p.finishedOn) ?? null;
  }

  // El total contra el que se valida la página sale de la EDICIÓN del pase
  // (o de la primaria si el pase no tiene ninguna asignada), no de
  // books.total_pages: la de bolsillo y la de tapa dura no tienen las mismas
  // páginas, así que "hasta la 240" solo es válido contra tu edición. Las
  // series no necesitan este total: los episodios marcados se validan contra
  // series_episodes dentro de markEpisodeWatched (mismo guard que la pestaña
  // Episodios), no aquí.
  let maxPosition: number | null = null;
  if (itemType === "book") {
    const editions = await getEditions(supabase, "book", itemId);
    const edition =
      editions.find((e) => e.id === currentOpenPass?.editionId) ??
      primaryEdition(editions);
    maxPosition = edition?.totalUnits ?? null;
    if (maxPosition === null) {
      const { data: book } = await supabase
        .from("books")
        .select("total_pages")
        .eq("id", itemId)
        .maybeSingle();
      maxPosition = book?.total_pages ?? null;
    }
  }

  // Position reached in this session. Optional: a time-only session (no
  // position entered) is valid and doesn't move the entry's position.
  //
  // Serie: el formulario manda `season` + varios `episodes` (chips
  // pulsables, uno por valor repetido). `episodesToMark` es lo que se marca
  // como visto abajo; `sessionPosition` aquí solo alimenta el HISTÓRICO de la
  // sesión (progress_sessions.position) — la posición real de la entrada la
  // deriva rollSeriesProgress a partir de episode_watches, nunca este valor.
  let sessionPosition: Position = {};
  let episodesToMark: { season: number; episode: number }[] = [];
  if (itemType === "book") {
    const pageRaw = String(formData.get("page") ?? "").trim();
    if (pageRaw) {
      const page = Number(pageRaw);
      if (!Number.isInteger(page) || page < 0) return { error: "invalidPosition" };
      if (maxPosition !== null && page > maxPosition) return { error: "invalidPosition" };
      sessionPosition = { page };
    }
  } else if (itemType === "series") {
    const seasonRaw = String(formData.get("season") ?? "").trim();
    const episodeNumbers = formData
      .getAll("episodes")
      .map((v) => Number(String(v).trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (episodeNumbers.length > 0) {
      const season = Number(seasonRaw);
      if (!Number.isInteger(season) || season < 0) return { error: "invalidPosition" };
      episodesToMark = episodeNumbers.map((episode) => ({ season, episode }));
      sessionPosition = { season, episode: Math.max(...episodeNumbers) };
    }
  }

  const statusRaw = String(formData.get("status") ?? "").trim();
  const status = VALID_STATUSES.includes(statusRaw as MediaStatus)
    ? (statusRaw as MediaStatus)
    : undefined;

  const { error: insertError } = await supabase.from("progress_sessions").insert({
    library_entry_id: entryId,
    user_id: user.id,
    ...(sessionDate && { session_date: sessionDate }),
    duration_minutes: durationMinutes,
    position: sessionPosition,
    note: note || null,
    pass_id: currentOpenPass?.id ?? null,
  });

  if (insertError) return { error: "generic" };

  // Serie: marca cada episodio reutilizando la MISMA escritura que la
  // pestaña Episodios (episode-watch-store.ts) y deja que rollSeriesProgress
  // recalcule la posición una sola vez — toma el episodio más avanzado de
  // TODO lo marcado, así que registrar aquí un episodio antiguo nunca hace
  // retroceder el progreso (§Tarea 15).
  if (itemType === "series" && episodesToMark.length > 0) {
    for (const { season, episode } of episodesToMark) {
      await markEpisodeWatched(supabase, user.id, itemId, season, episode);
    }
    await rollSeriesProgress(supabase, user.id, itemId);
  }

  // Roll the entry's current position forward. For books, merge so the
  // copy's `format` (part of the same JSONB) isn't lost by a page update.
  // Para series NO se escribe aquí: rollSeriesProgress ya dejó la posición
  // derivada de episode_watches.
  const hasSessionPosition = Object.keys(sessionPosition).length > 0;
  const currentPosition = parsePosition(itemType, entry.position);
  const nextPosition =
    itemType === "book" && hasSessionPosition
      ? { ...currentPosition, ...sessionPosition }
      : undefined;

  if (nextPosition || status) {
    // Same queue cleanup as updateStatus (§7.22) — a session can also roll
    // status out of "planned", which should drop the queue membership+order.
    const { error: updateError } = await supabase
      .from("library_entries")
      .update({
        ...(nextPosition && { position: nextPosition }),
        ...(status && {
          status,
          ...(status !== "planned" && { queue_id: null, queue_order: null }),
        }),
      })
      .eq("id", entryId)
      .eq("user_id", user.id);

    if (updateError) return { error: "generic" };
  }

  revalidateItemViews(itemType, itemId);
  redirect(itemHref(itemType, itemId));
}

export async function deleteSession(
  sessionId: string,
  itemType: ItemType,
  itemId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("progress_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateItemViews(itemType, itemId);
}
