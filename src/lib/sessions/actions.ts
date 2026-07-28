"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition, type Position } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getActivePass } from "@/lib/passes/get-passes";
import { applyTransition } from "@/lib/passes/apply-transition";
import { getEditions } from "@/lib/editions/get-editions";
import { primaryEdition } from "@/lib/editions/edition-label";
import {
  markEpisodeWatched,
  rollSeriesProgress,
} from "@/lib/series/episode-watch-store";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";

const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

// `ok` marca el guardado con éxito; el cliente decide entonces a dónde ir —
// cerrar el modal y quedarse, o navegar a la ficha si vino por la ruta
// directa. `passClosed` avisa de que la sesión completó el pase: el cliente
// encadena la hoja de cierre en vez de irse (D4 de la spec).
export type AddSessionState = {
  error?: "invalidPosition" | "invalidDuration" | "generic";
  ok?: boolean;
  passClosed?: boolean;
};

// Logs a reading/watching session AND rolls the PASE's current state
// forward (position + status) — the session form is the daily-loop way of
// updating progress. La sesión cuelga del pase ACTIVO (§Tarea 7, hub):
// library_entries deja de participar aquí. Ver docs/REQUIREMENTS.md §7.14.
export async function addSession(
  passId: string,
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

  // El passId que llega del formulario tiene que ser EXACTAMENTE el pase
  // activo de la obra ahora mismo — nunca un pase archivado de una relectura
  // anterior (p. ej. una pestaña vieja abierta contra un pase que ya se
  // cerró y se reemplazó por uno nuevo).
  const pass = await getActivePass(supabase, itemType, itemId, user.id);
  if (!pass || pass.id !== passId) return { error: "generic" };

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

  // Hora real de inicio (§7.14, P8): la manda el cronómetro; la hoja a mano no,
  // y queda null. "Cuándo lees" ignora las filas sin ella — nunca se sustituye
  // por created_at (eso es cuándo registraste, no cuándo consumiste).
  const startedAtRaw = String(formData.get("startedAt") ?? "").trim();
  let startedAt: string | null = null;
  if (startedAtRaw) {
    const parsed = new Date(startedAtRaw);
    if (!Number.isNaN(parsed.getTime())) startedAt = parsed.toISOString();
  }

  // Registrar una sesión implica que has empezado: si el pase seguía
  // "planificado", esta es la primera escritura y la máquina lo mueve a "en
  // curso" — sustituye al openPass() de antes de la migración hub. El resto
  // de cambios de estado (Select de abajo) SÍ son elección explícita del
  // usuario y se tratan aparte.
  let currentStatus = pass.status;
  if (currentStatus === "planned") {
    await applyTransition(supabase, user.id, itemType, itemId, "in_progress");
    currentStatus = "in_progress";
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
      editions.find((e) => e.id === pass.editionId) ?? primaryEdition(editions);
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
  // position entered) is valid and doesn't move the pase's position.
  //
  // Serie: el formulario manda `season` + varios `episodes` (chips
  // pulsables, uno por valor repetido). `episodesToMark` es lo que se marca
  // como visto abajo; `sessionPosition` aquí solo alimenta el HISTÓRICO de la
  // sesión (progress_sessions.position) — la posición real del pase la
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

  const { data: inserted, error: insertError } = await supabase
    .from("progress_sessions")
    .insert({
      pass_id: passId,
      user_id: user.id,
      ...(sessionDate && { session_date: sessionDate }),
      duration_minutes: durationMinutes,
      position: sessionPosition,
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (insertError || !inserted) return { error: "generic" };

  // Las notas de esta sesión ya se guardaron sueltas (SessionNotebook,
  // session_id null) mientras la hoja estaba abierta — aquí solo se
  // enlazan a la sesión recién creada. Best-effort a propósito (D4 de la
  // spec 2026-07-29): si falla, la sesión y las notas siguen existiendo,
  // solo queda sin poner la etiqueta de agrupación.
  const noteIds = formData.getAll("noteIds").map(String).filter(Boolean);
  if (noteIds.length > 0) {
    await supabase
      .from("notes")
      .update({ session_id: inserted.id })
      .eq("user_id", user.id)
      .eq("pass_id", passId)
      .is("session_id", null)
      .in("id", noteIds);
  }

  // Serie: marca cada episodio reutilizando la MISMA escritura que la
  // pestaña Episodios (episode-watch-store.ts), atado al PASE de esta sesión
  // (Tarea 8, hub) — no a user+series como antes de la migración del hub —
  // y deja que rollSeriesProgress recalcule la posición una sola vez — toma
  // el episodio más avanzado de TODO lo marcado EN ESTE PASE, así que
  // registrar aquí un episodio antiguo nunca hace retroceder el progreso
  // (§Tarea 15). `seriesReachedEnd` alimenta el mismo auto-cierre que ya
  // tenía el libro más abajo.
  let seriesReachedEnd = false;
  if (itemType === "series" && episodesToMark.length > 0) {
    for (const { season, episode } of episodesToMark) {
      await markEpisodeWatched(supabase, user.id, itemId, passId, season, episode);
    }
    const result = await rollSeriesProgress(supabase, user.id, itemId, passId);
    seriesReachedEnd = result.reachedEnd;
  }

  // El Select de estado del formulario NUNCA escribe a mano (era el fallo 5
  // de la spec): si el usuario eligió un estado distinto del que ya tiene el
  // pase, se pide por la máquina — la misma que usa el segmented de la ficha.
  if (status && status !== currentStatus) {
    await applyTransition(supabase, user.id, itemType, itemId, status);
  }

  // Roll the pase's current position forward. For books, merge so the
  // copy's `format` (part of the same JSONB) isn't lost by a page update.
  // Para series NO se escribe aquí: rollSeriesProgress ya dejó la posición
  // derivada de episode_watches.
  const hasSessionPosition = Object.keys(sessionPosition).length > 0;
  const currentPosition = parsePosition(itemType, pass.position);
  const nextPosition =
    itemType === "book" && hasSessionPosition
      ? { ...currentPosition, ...sessionPosition }
      : undefined;

  if (nextPosition) {
    const { error: updateError } = await supabase
      .from("passes")
      .update({ position: nextPosition })
      .eq("id", passId)
      .eq("user_id", user.id);
    if (updateError) return { error: "generic" };
  }

  // Auto-cierre de libro o serie (Regla 5 del esquema de flujo): si la
  // sesión alcanza la última página de TU edición (libro) o el último
  // episodio de la serie EN ESTE PASE (rollSeriesProgress arriba), el pase
  // se completa solo — pasando por la máquina, no aparte. Antes esto
  // redirigía a `?cerrar=<passId>&tab=log` para que la ficha encadenara la
  // hoja de cierre; un redirect de servidor tira la página bajo el modal, así
  // que ahora se devuelve `passClosed: true` y es el CLIENTE quien decide
  // cómo encadenar la hoja (D4 de la spec) — ver `AddSessionState` arriba.
  const reachedEnd =
    (itemType === "book" &&
      maxPosition !== null &&
      "page" in sessionPosition &&
      sessionPosition.page === maxPosition) ||
    seriesReachedEnd;
  if (reachedEnd) {
    await applyTransition(supabase, user.id, itemType, itemId, "completed");
    revalidateReadingLog(itemType, itemId);
    return { ok: true, passClosed: true };
  }

  revalidateReadingLog(itemType, itemId);
  return { ok: true };
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
  revalidateReadingLog(itemType, itemId);
}
