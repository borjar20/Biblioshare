import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { FeedEvent, FeedVerb } from "./feed";
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";

// Resuelve UNA fila concreta (no un fan-out por seguidos) a la misma forma
// FeedEvent que usa el feed personal (Bloque C, SD-1) -- usado por
// activity_share (Bloque F) para re-derivar en cada lectura lo que se
// compartió a un club, en vez de guardar un snapshot congelado. ShareRef usa
// el mismo vocabulario que FeedEvent.id (`${sourceTable}:${rowId}`) para no
// inventar una nomenclatura paralela -- el picker de compartir simplemente
// hace `feedEvent.id.split(":")`.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// "diary_entries_added" (no "library_entries", §Tarea 9 hub): el evento
// "added" ahora sale de un pase (su propio created_at), no de una entrada de
// biblioteca -- se etiqueta distinto de "diary_entries" (el evento
// "finished") porque ambos pueden apuntar a la MISMA fila (un pase que se
// cierra el mismo día que se abre), y el par (sourceTable, rowId) tiene que
// seguir identificando un evento único. sourceTable es una etiqueta interna
// de enrutado, no un nombre de tabla literal -- ref.sourceTable se persiste
// en club_posts.ref (JSONB), así que una comparticiones vieja con
// "library_entries" ya no resuelve tras esta migración (se trata como fila
// borrada: "ya no disponible"), coste aceptado del cierre de la ventana
// transicional.
export type ShareRef = {
  sourceTable: "diary_entries_added" | "progress_sessions" | "diary_entries" | "episode_watches";
  rowId: string;
};

// Un post compartido solo necesita un preview de la actividad. Mantenerlo
// separado del FeedEvent evita exponer un target interactivo deliberadamente
// no cargado (y, por tanto, un interactionTargetId nulo) al cliente.
export type SharedActivityPreview = Omit<
  FeedEvent,
  "interactionTarget" | "reactionCount" | "viewerReacted" | "commentCount" | "comments"
>;

const REVIEW_EXCERPT_LENGTH = 200;

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= REVIEW_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, REVIEW_EXCERPT_LENGTH).trimEnd() + "…";
}

function verbForReviewable(rating: number | null, review: string | null, floor: FeedVerb): FeedVerb {
  if (review) return "reviewed";
  if (rating != null) return "rated";
  return floor;
}

async function resolveActor(supabase: SupabaseServerClient, userId: string) {
  const { data } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.username ? data : null;
}

async function resolveCatalog(supabase: SupabaseServerClient, itemType: ItemType, itemId: string) {
  if (itemType === "book") {
    const { data } = await supabase
      .from("books")
      .select("title, author, cover_url")
      .eq("id", itemId)
      .maybeSingle();
    return data ? { title: data.title, cover_url: data.cover_url, subtitle: data.author } : null;
  }
  const table = itemType === "movie" ? "movies" : "series";
  const { data } = await supabase.from(table).select("title, cover_url").eq("id", itemId).maybeSingle();
  return data ? { title: data.title, cover_url: data.cover_url, subtitle: null } : null;
}

// item_type/item_id son columnas propias del pase (§Tarea 9): resuelve la
// obra de un pase por su id, ya sin pasar por library_entries.
async function resolvePassItem(supabase: SupabaseServerClient, passId: string) {
  const { data } = await supabase
    .from("passes")
    .select("item_type, item_id")
    .eq("id", passId)
    .maybeSingle();
  if (!data) return null;
  return { itemType: data.item_type as ItemType, itemId: data.item_id };
}

// Devuelve null (sin lanzar) tanto si la fila origen ya no existe (borrada)
// como si el viewer no puede verla vía RLS -- el post que la referencia
// debe renderizar un estado "ya no disponible" en cualquiera de los dos
// casos, nunca un error.
export async function resolveSharedActivity(
  supabase: SupabaseServerClient,
  ref: ShareRef,
): Promise<SharedActivityPreview | null> {
  if (ref.sourceTable === "diary_entries_added") {
    // item_type/item_id/status/created_at ya son columnas propias del pase
    // (§Tarea 9): sin join a library_entries.
    const { data: row } = await supabase
      .from("passes")
      .select("id, user_id, item_type, item_id, status, created_at")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, row.item_type, row.item_id),
    ]);
    if (!actor || !catalog) return null;
    return {
      id: `diary_entries_added:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "added",
      itemType: row.item_type,
      itemId: row.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      itemSubtitle: catalog.subtitle,
      entryStatus: row.status,
      eventDate: row.created_at,
      // orderDate = la columna de fecha de la fuente (FEED_SOURCE_COLUMNS); en
      // las altas es el mismo created_at.
      orderDate: row.created_at,
      // sortDate = created_at, el contrato del campo en FeedEvent. Esta vista
      // resuelve UNA fila y no pasa por el keyset del feed, pero el campo se
      // rellena con la hora real de registro igual que allí.
      sortDate: row.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: null,
      reviewMeta: null,
    };
  }

  if (ref.sourceTable === "progress_sessions") {
    // La sesión cuelga del pase vía pass_id (§Tarea 9, hub): sin
    // library_entry_id.
    const { data: row } = await supabase
      .from("progress_sessions")
      // `note` NO se pide: es la copia PRIVADA del autor. La nota pública se
      // resuelve aparte desde `notes` (is_public=true), igual que getFeed.
      // `position` sí, para derivar page/percent en libros (#301).
      .select("id, user_id, pass_id, session_date, duration_minutes, created_at, position")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const item = await resolvePassItem(supabase, row.pass_id);
    if (!item) return null;
    // La nota PÚBLICA de esta sesión (Task 1: política RLS `public notes select`).
    // El .eq("is_public", true) es cinturón-y-tirantes sobre la RLS. Una sola
    // fila: la más reciente pública. total_pages solo para libros (percent).
    const [actor, catalog, publicNote, totalPages] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, item.itemType, item.itemId),
      supabase
        .from("notes")
        .select("body, is_spoiler")
        .eq("session_id", row.id)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then((r) =>
          r.data?.body != null
            ? { body: r.data.body, isSpoiler: r.data.is_spoiler ?? false }
            : null,
        ),
      item.itemType === "book"
        ? supabase
            .from("books")
            .select("total_pages")
            .eq("id", item.itemId)
            .maybeSingle()
            .then((r) => r.data?.total_pages ?? null)
        : Promise.resolve<number | null>(null),
    ]);
    if (!actor || !catalog) return null;
    const pos = (row.position ?? {}) as { page?: number };
    const page = typeof pos.page === "number" ? pos.page : null;
    const percent =
      page != null && totalPages ? Math.min(100, Math.round((page / totalPages) * 100)) : null;
    return {
      id: `progress_sessions:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "progressed",
      itemType: item.itemType,
      itemId: item.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      itemSubtitle: catalog.subtitle,
      entryStatus: null,
      eventDate: sessionRelativeBasis(row.session_date, row.created_at),
      orderDate: row.session_date,
      sortDate: row.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      // page/percent/note resueltos como en getFeed (#301): page desde
      // position, percent contra books.total_pages, note desde la nota PÚBLICA.
      // La copia privada `progress_sessions.note` nunca se sirve aquí.
      progress: { durationMinutes: row.duration_minutes, page, percent, note: publicNote },
      reviewMeta: null,
    };
  }

  if (ref.sourceTable === "diary_entries") {
    // review ya no es una columna legible de diary_entries: se lee de la
    // vista pass_reviews (privacidad ya aplicada — ver
    // 20260714_passes_review_privacy.sql). El .eq("is_public", true) de abajo
    // se deja como defensa en profundidad y para dejar la intención
    // explícita: esto resuelve posts compartidos en clubes, que puede ver
    // cualquier miembro (no solo el autor), así que una reseña privada se
    // trata igual que "la fila ya no existe" (null) más abajo.
    const { data: row } = await supabase
      .from("pass_reviews")
      .select("id, user_id, item_type, item_id, finished_on, rating, review, updated_at")
      .eq("id", ref.rowId)
      // Un pase abierto no es actividad terminada: si es lo único que hay
      // que resolver, se trata igual que "la fila ya no existe" (null).
      .not("finished_on", "is", null)
      .eq("is_public", true)
      .maybeSingle();
    // El filtro anterior garantiza finished_on no nulo; se narrowa aquí
    // porque Supabase no infiere el tipo a partir de la query. pass_reviews
    // tipa TODAS sus columnas como nullable (es una vista), así que también
    // se narrowan id/user_id/item_type/item_id/updated_at — nunca vienen null
    // en la práctica. updated_at (no created_at, #345) es la hora REAL del
    // terminado; entra en la MISMA lista y no se cae a finished_on: `sortDate`
    // promete un timestamp real, y un valor date-only ahí ordena por debajo de
    // todo evento con hora de su día y empata con sus iguales (desempate por
    // uuid). Sin hora real, la fila se trata como "ya no disponible", igual que
    // sin id.
    if (
      !row ||
      row.id === null ||
      row.user_id === null ||
      row.item_type === null ||
      row.item_id === null ||
      row.finished_on === null ||
      row.updated_at === null
    )
      return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, row.item_type, row.item_id),
    ]);
    if (!actor || !catalog) return null;
    return {
      id: `diary_entries:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(row.rating, row.review, "finished"),
      itemType: row.item_type,
      itemId: row.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      itemSubtitle: catalog.subtitle,
      entryStatus: null,
      eventDate: row.finished_on,
      orderDate: row.finished_on,
      // sortDate = updated_at (#345), hora real del terminado; timestamp real
      // garantizado por el narrowing de arriba.
      sortDate: row.updated_at,
      rating: row.rating,
      reviewExcerpt: excerpt(row.review),
      episode: null,
      progress: null,
      reviewMeta: null,
    };
  }

  // episode_watches
  const { data: row } = await supabase
    .from("episode_watches")
    .select("id, user_id, series_id, season_number, episode_number, rating, review, watched_on, created_at")
    .eq("id", ref.rowId)
    .maybeSingle();
  if (!row) return null;
  const [actor, catalog, episodeTitle] = await Promise.all([
    resolveActor(supabase, row.user_id),
    resolveCatalog(supabase, "series", row.series_id),
    supabase
      .from("series_episodes")
      .select("title")
      .eq("series_id", row.series_id)
      .eq("season_number", row.season_number)
      .eq("episode_number", row.episode_number)
      .maybeSingle()
      .then((r) => r.data?.title ?? null),
  ]);
  if (!actor || !catalog) return null;
  return {
    id: `episode_watches:${row.id}`,
    actorId: row.user_id,
    actorUsername: actor.username!,
    actorDisplayName: actor.display_name,
    actorAvatarUrl: actor.avatar_url,
    verb: verbForReviewable(row.rating, row.review, "watchedEpisode"),
    itemType: "series",
    itemId: row.series_id,
    itemTitle: catalog.title,
    itemCoverUrl: catalog.cover_url,
    itemSubtitle: catalog.subtitle,
    entryStatus: null,
    eventDate: row.watched_on,
    orderDate: row.watched_on,
    sortDate: row.created_at,
    rating: row.rating,
    reviewExcerpt: excerpt(row.review),
    episode: { season: row.season_number, episode: row.episode_number, title: episodeTitle },
    progress: null,
    reviewMeta: null,
  };
}
