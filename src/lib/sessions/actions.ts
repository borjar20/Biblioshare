"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition, type Position } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";
import { getActivePass, isAutoCloseable } from "@/lib/passes/get-passes";
import { applyTransition } from "@/lib/passes/apply-transition";
import { todayISO } from "@/lib/stats/dates";
import { getEditions } from "@/lib/editions/get-editions";
import { primaryEdition } from "@/lib/editions/edition-label";
import {
  markEpisodeWatched,
  rollSeriesProgress,
} from "@/lib/series/episode-watch-store";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";
import { createPost } from "@/lib/social/post-actions";
import { earnDailyLoopCelebrations } from "@/lib/celebrations/earn";

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
  error?: "invalidPosition" | "invalidDuration" | "futureDate" | "generic";
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

  // No se registran sesiones en el FUTURO. El date picker ya pone `max`, pero
  // una server action es un POST público, así que se rechaza también aquí
  // (#352): además de ser un dato absurdo, una sesión futura envenena la clave
  // de orden del feed (sessionRelativeBasis). Se compara contra el "hoy" del
  // servidor; el borde de huso (tu "hoy" ya es el "mañana" del servidor) lo
  // cubre el `max` del cliente, que va en tu calendario local.
  if (sessionDate && sessionDate > todayISO()) return { error: "futureDate" };

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
    const editions = await getEditions("book", itemId);
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

  // El Select de estado del formulario NUNCA escribe a mano (era el fallo 5 de
  // la spec): si el usuario eligió un estado distinto del que ya tiene el pase,
  // se pide por la máquina — la misma que usa el segmented de la ficha.
  //
  // #717: esto va AQUÍ, antes de escribir nada, y no al final. Cuando el estado
  // elegido archiva el pase y crea otro (`archiveAndCreate`: releer algo que ya
  // estaba cerrado), la sesión, el cursor, los episodios y las notas tienen que
  // caer TODOS en el pase que queda vivo. Antes la transición corría después y
  // esas escrituras se quedaban colgando del pase recién archivado: quedaba
  // actividad registrada contra un pase que ya no era el vivo.
  //
  // La decisión de producto, tomada a propósito: **registrar una sesión y
  // cambiar de estado en el mismo gesto son afirmaciones sobre la MISMA
  // lectura**. Si el usuario dice «he leído hasta aquí y lo estoy releyendo»,
  // lo leído es de la relectura.
  //
  // Lo que se acepta a cambio: si la inserción de la sesión fallara justo
  // después, el estado ya habría cambiado. Es el orden menos malo — al revés, un
  // fallo al repuntar parte la sesión y el pase en dos, que es el bug de origen.
  let effectivePassId = passId;
  let passWasCreated = false;
  if (status && status !== currentStatus) {
    const outcome = await applyTransition(supabase, user.id, itemType, itemId, status);
    // `askResume` (abandonado → leyendo) no escribe nada: la máquina no puede
    // elegir sola entre continuar y empezar de cero. Se sigue con el pase de
    // siempre; que el usuario no reciba aviso de esto es #737.
    if (outcome.kind === "done") {
      effectivePassId = outcome.passId;
      passWasCreated = outcome.created;
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("progress_sessions")
    .insert({
      pass_id: effectivePassId,
      user_id: user.id,
      ...(sessionDate && { session_date: sessionDate }),
      duration_minutes: durationMinutes,
      position: sessionPosition,
      started_at: startedAt,
    })
    .select("id")
    .single();

  if (insertError || !inserted) return { error: "generic" };

  // Registrar una sesión NO avisa a nadie por sí solo: el aviso a seguidores lo
  // emite createPost más abajo, y solo si el usuario marcó «Compartir». Ese es el
  // trato de la spec 2026-08-13 — se pierden los avisos de lo no compartido a
  // cambio de que el aviso lleve siempre al post.

  // Las notas de esta sesión ya se guardaron sueltas (SessionNotebook,
  // session_id null) mientras la hoja estaba abierta — aquí solo se
  // enlazan a la sesión recién creada. Best-effort a propósito (D4 de la
  // spec 2026-07-29): si falla, la sesión y las notas siguen existiendo,
  // solo queda sin poner la etiqueta de agrupación.
  //
  // #717: se filtra por el pase ORIGINAL —es con el que se escribieron mientras
  // la hoja estaba abierta— pero se repunta `pass_id` al pase vivo, junto con la
  // sesión. Si no, una nota se quedaría colgando del pase archivado mientras su
  // sesión cuelga del nuevo: la misma partición que este arreglo viene a cerrar.
  const noteIds = formData.getAll("noteIds").map(String).filter(Boolean);
  if (noteIds.length > 0) {
    await supabase
      .from("notes")
      .update({ session_id: inserted.id, pass_id: effectivePassId })
      .eq("user_id", user.id)
      .eq("pass_id", passId)
      .is("session_id", null)
      .in("id", noteIds);
  }

  // Compartir en el perfil (Spec 2, §8): opt-in del formulario. La sesión
  // (fuente de verdad) ya está guardada; si el usuario marcó «Compartir», además
  // se publica un post 'progressed' anclado a la obra, con el texto opcional como
  // cuerpo social (el compositor de Pensamiento hace el mismo gesto con
  // createPost). Best-effort: createPost devuelve un resultado discriminado y
  // NUNCA lanza, así que un fallo al compartir no tumba el guardado de la sesión
  // que el usuario sí pidió. Idempotente por el índice único de posts
  // (source_kind, source_id, kind): `inserted.id` es esta sesión, única.
  if (formData.get("share") === "on") {
    const shareBody = String(formData.get("shareBody") ?? "").trim();
    await createPost({
      kind: "progressed",
      anchorType: itemType,
      anchorId: itemId,
      sourceKind: "progress_session",
      sourceId: inserted.id,
      body: shareBody || undefined,
      isSpoiler: formData.get("shareSpoiler") === "on",
    });
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
      await markEpisodeWatched(supabase, user.id, itemId, effectivePassId, season, episode);
    }
    const result = await rollSeriesProgress(supabase, user.id, itemId, effectivePassId);
    seriesReachedEnd = result.reachedEnd;
  }

  // Roll the pase's current position forward. For books, merge so the
  // copy's `format` (part of the same JSONB) isn't lost by a page update.
  // Para series NO se escribe aquí: rollSeriesProgress ya dejó la posición
  // derivada de episode_watches.
  //
  // #717: si la transición creó un pase NUEVO, la base del merge es `{}` y no la
  // posición del pase viejo. Una relectura empieza a cero (Regla 5): arrastrarle
  // la página del pase anterior la haría nacer por la mitad. Lo único que se
  // pierde es el `format` de la copia, que era de aquella lectura.
  const hasSessionPosition = Object.keys(sessionPosition).length > 0;
  const currentPosition = passWasCreated ? {} : parsePosition(itemType, pass.position);
  const nextPosition =
    itemType === "book" && hasSessionPosition
      ? { ...currentPosition, ...sessionPosition }
      : undefined;

  if (nextPosition) {
    const { error: updateError } = await supabase
      .from("passes")
      .update({ position: nextPosition })
      .eq("id", effectivePassId)
      .eq("user_id", user.id);
    if (updateError) return { error: "generic" };
  }

  // Microanimaciones del bucle diario (primera actividad, objetivo diario,
  // hito de racha): best-effort, nunca tumba el guardado de la sesión. El
  // cliente drena y anima tras recibir `ok` (checkCelebrations en session-sheet).
  await earnDailyLoopCelebrations(supabase, user.id);

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
  // `isAutoCloseable` (#716, mismo criterio que la pestaña Episodios): si el
  // usuario acaba de elegir `dropped` en ESTA misma hoja, el auto-cierre no
  // puede pisarlo con un `completed`. Alcanzar el final y abandonar son dos
  // afirmaciones sobre el mismo pase, y manda la que hizo el usuario a mano.
  if (reachedEnd && (await isAutoCloseable(supabase, effectivePassId, user.id))) {
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
