import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { getInteractionSummary, type InteractionComment } from "./interactions";

// Feed de actividad personal (EPIC-05, Bloque C, SD-1). On-read fan-out sobre
// cuatro tablas fuente ya existentes — sin tabla nueva. La RLS de cada fuente
// (can_view_profile) ya resuelve la visibilidad "seguidor aceptado"; el feed
// no necesita lógica de visibilidad propia, solo filtra por seguidos.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FeedVerb =
  | "added"
  | "progressed"
  | "finished"
  | "rated"
  | "reviewed"
  | "watchedEpisode";

export type FeedEvent = {
  id: string; // `${sourceTable}:${rowId}`
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  verb: FeedVerb;
  itemType: ItemType;
  itemId: string;
  itemTitle: string;
  itemCoverUrl: string | null;
  // Autor del catálogo — solo los libros lo tienen; películas/series no
  // guardan creador, así que queda null.
  itemSubtitle: string | null;
  // Estado de la entrada de biblioteca; solo informa el verbo "added".
  entryStatus: MediaStatus | null;
  eventDate: string;
  rating: number | null;
  reviewExcerpt: string | null;
  episode: { season: number; episode: number; title: string | null } | null;
  progress: { durationMinutes: number | null; note: string | null } | null;
  interactionTarget: { targetType: "diary_entry" | "episode_watch"; targetId: string } | null;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

export type FeedPage = {
  events: FeedEvent[];
  nextCursor: string | null;
};

export type FeedOptions = {
  /** Cursor keyset opaco: `${eventDate}~${eventId}` del último evento servido. */
  cursor?: string;
  pageSize?: number;
  itemType?: ItemType;
  reviewsOnly?: boolean;
};

const DEFAULT_PAGE_SIZE = 20;
const REVIEW_EXCERPT_LENGTH = 200;

// ── Cursor keyset (fecha, id) ────────────────────────────────────────────────
// Las 4 fuentes mezclan granularidades: library_entries pagina por timestamptz
// y las otras tres por date. El cursor antiguo era solo la fecha y filtraba con
// `lt`, así que al paginar se PERDÍAN todos los demás eventos del mismo día
// (p. ej. dos pases de diario con el mismo finished_on). Ahora: se consulta con
// `lte` (inclusivo) y el par (fecha, id) desempata en cliente — el mismo orden
// total (fecha desc, id desc, comparación de strings) que usa el sort de abajo,
// de modo que "estrictamente después del cursor" está bien definido aunque se
// mezclen '2026-07-13' y '2026-07-13T15:00:00+00:00'.

const CURSOR_SEPARATOR = "~"; // no aparece ni en fechas ISO ni en los event ids

function parseCursor(cursor: string): { date: string; id: string } {
  const sep = cursor.indexOf(CURSOR_SEPARATOR);
  // Cursor legado (solo fecha, de una sesión anterior al cambio de formato):
  // id vacío ordena antes que cualquier id real, así que degrada al
  // comportamiento antiguo sin romper.
  if (sep === -1) return { date: cursor, id: "" };
  return { date: cursor.slice(0, sep), id: cursor.slice(sep + 1) };
}

// Cota superior INCLUSIVA para una columna date a partir de la fecha del cursor.
function dateUpperBound(cursorDate: string): string {
  return cursorDate.slice(0, 10);
}

// Cota superior INCLUSIVA para una columna timestamptz: si el cursor viene de
// un evento date-only, cualquier timestamp de ese mismo día debe entrar en el
// fetch (el filtro de cliente decide después).
function timestampUpperBound(cursorDate: string): string {
  return cursorDate.includes("T") ? cursorDate : `${cursorDate}T23:59:59.999+00:00`;
}

// ¿Va `event` estrictamente DESPUÉS del cursor en el orden total (fecha desc,
// id desc)? Los ya servidos (incluido el propio evento del cursor) quedan fuera.
function isAfterCursor(event: { eventDate: string; id: string }, cursor: { date: string; id: string }): boolean {
  if (event.eventDate !== cursor.date) return event.eventDate < cursor.date;
  return event.id < cursor.id;
}

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

export async function getFeed(
  supabase: SupabaseServerClient,
  viewerId: string,
  options: FeedOptions = {},
): Promise<FeedPage> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const cursor = options.cursor ? parseCursor(options.cursor) : null;

  const { data: followRows, error: followError } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", viewerId)
    .eq("status", "accepted");
  if (followError) throw followError;

  const followedIds = (followRows ?? []).map((f) => f.followee_id);
  if (followedIds.length === 0) return { events: [], nextCursor: null };

  // Si se filtra por tipo de ítem, resolvemos primero qué library_entries de
  // los seguidos son de ese tipo — diary_entries/progress_sessions no tienen
  // item_type propio, solo llegan a él vía library_entry_id.
  let libraryEntryIdsForType: string[] | null = null;
  if (options.itemType) {
    const { data: typedEntries, error: typedError } = await supabase
      .from("library_entries")
      .select("id")
      .in("user_id", followedIds)
      .eq("item_type", options.itemType);
    if (typedError) throw typedError;
    libraryEntryIdsForType = (typedEntries ?? []).map((e) => e.id);
  }
  // Si el filtro de tipo no dejó ningún library_entry, diary/progress no
  // pueden aportar nada — se evita el .in([]) ambiguo saltándose la query.
  const typeFilterExcludesAll =
    options.itemType !== undefined && (libraryEntryIdsForType?.length ?? 0) === 0;

  const includeAdded = !options.reviewsOnly && !typeFilterExcludesAll;
  const includeProgressed = !options.reviewsOnly && !typeFilterExcludesAll;
  const includeDiary = !typeFilterExcludesAll;
  const includeEpisodes =
    (options.itemType === undefined || options.itemType === "series") &&
    !typeFilterExcludesAll;

  const [addedResult, progressedResult, diaryResult, episodeResult] = await Promise.all([
    includeAdded
      ? (() => {
          let q = supabase
            .from("library_entries")
            .select("id, user_id, item_type, item_id, status, created_at")
            .in("user_id", followedIds)
            .order("created_at", { ascending: false })
            .limit(pageSize);
          if (options.itemType) q = q.eq("item_type", options.itemType);
          if (cursor) q = q.lte("created_at", timestampUpperBound(cursor.date));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeProgressed
      ? (() => {
          let q = supabase
            .from("progress_sessions")
            .select("id, user_id, library_entry_id, session_date, duration_minutes, note")
            .in("user_id", followedIds)
            .order("session_date", { ascending: false })
            .limit(pageSize);
          if (libraryEntryIdsForType) q = q.in("library_entry_id", libraryEntryIdsForType);
          if (cursor) q = q.lte("session_date", dateUpperBound(cursor.date));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeDiary
      ? (() => {
          let q = supabase
            .from("diary_entries")
            .select("id, user_id, library_entry_id, finished_on, rating, review")
            .in("user_id", followedIds)
            .order("finished_on", { ascending: false })
            .limit(pageSize);
          if (libraryEntryIdsForType) q = q.in("library_entry_id", libraryEntryIdsForType);
          if (options.reviewsOnly) q = q.not("review", "is", null);
          if (cursor) q = q.lte("finished_on", dateUpperBound(cursor.date));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeEpisodes
      ? (() => {
          let q = supabase
            .from("episode_watches")
            .select(
              "id, user_id, series_id, season_number, episode_number, rating, review, watched_on",
            )
            .in("user_id", followedIds)
            .order("watched_on", { ascending: false })
            .limit(pageSize);
          if (options.reviewsOnly) q = q.not("review", "is", null);
          if (cursor) q = q.lte("watched_on", dateUpperBound(cursor.date));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (addedResult.error) throw addedResult.error;
  if (progressedResult.error) throw progressedResult.error;
  if (diaryResult.error) throw diaryResult.error;
  if (episodeResult.error) throw episodeResult.error;

  const addedRows = addedResult.data ?? [];
  const progressedRows = progressedResult.data ?? [];
  const diaryRows = diaryResult.data ?? [];
  const episodeRows = episodeResult.data ?? [];

  // "Se agotaron todas las fuentes" se mide sobre el fetch bruto de cada
  // query de arriba (antes del merge/corte de más abajo), no sobre cuántas
  // filas de cada fuente sobreviven al corte a pageSize.
  const allExhausted =
    addedRows.length < pageSize &&
    progressedRows.length < pageSize &&
    diaryRows.length < pageSize &&
    episodeRows.length < pageSize;

  // library_entries de progress_sessions/diary_entries → item_type/item_id.
  const libraryEntryIds = [
    ...new Set([
      ...progressedRows.map((r) => r.library_entry_id),
      ...diaryRows.map((r) => r.library_entry_id),
    ]),
  ];
  const { data: libraryEntries, error: libError } = libraryEntryIds.length
    ? await supabase
        .from("library_entries")
        .select("id, item_type, item_id")
        .in("id", libraryEntryIds)
    : { data: [] as { id: string; item_type: ItemType; item_id: string }[], error: null };
  if (libError) throw libError;
  const itemByLibraryEntry = new Map(
    (libraryEntries ?? []).map((e) => [
      e.id,
      { itemType: e.item_type as ItemType, itemId: e.item_id },
    ]),
  );

  // Catálogo (título/portada) por tipo, mismo patrón batch que
  // get-library-items.ts.
  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of addedRows) idsByType[r.item_type].add(r.item_id);
  for (const r of progressedRows) {
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (it) idsByType[it.itemType].add(it.itemId);
  }
  for (const r of diaryRows) {
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (it) idsByType[it.itemType].add(it.itemId);
  }
  for (const r of episodeRows) idsByType.series.add(r.series_id);

  const [books, movies, series] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, title, author, cover_url").in("id", [...idsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string; author: string | null; cover_url: string | null }[], error: null }),
    idsByType.movie.size
      ? supabase.from("movies").select("id, title, cover_url").in("id", [...idsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[], error: null }),
    idsByType.series.size
      ? supabase.from("series").select("id, title, cover_url").in("id", [...idsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[], error: null }),
  ]);
  if (books.error) throw books.error;
  if (movies.error) throw movies.error;
  if (series.error) throw series.error;
  const catalogByKey = new Map<
    string,
    { title: string; coverUrl: string | null; subtitle: string | null }
  >();
  for (const r of books.data ?? [])
    catalogByKey.set(`book:${r.id}`, {
      title: r.title,
      coverUrl: r.cover_url,
      subtitle: r.author,
    });
  for (const r of movies.data ?? [])
    catalogByKey.set(`movie:${r.id}`, { title: r.title, coverUrl: r.cover_url, subtitle: null });
  for (const r of series.data ?? [])
    catalogByKey.set(`series:${r.id}`, { title: r.title, coverUrl: r.cover_url, subtitle: null });

  // Título de episodio, best-effort (si no está en series_episodes aún, se
  // omite sin romper el evento).
  const episodeSeriesIds = [...new Set(episodeRows.map((r) => r.series_id))];
  const { data: episodeTitles, error: episodeTitlesError } = episodeSeriesIds.length
    ? await supabase
        .from("series_episodes")
        .select("series_id, season_number, episode_number, title")
        .in("series_id", episodeSeriesIds)
    : { data: [] as { series_id: string; season_number: number; episode_number: number; title: string | null }[], error: null };
  if (episodeTitlesError) throw episodeTitlesError;
  const titleByEpisode = new Map(
    (episodeTitles ?? []).map((e) => [
      `${e.series_id}:${e.season_number}:${e.episode_number}`,
      e.title,
    ]),
  );

  // Identidades de actor.
  const actorIds = [
    ...new Set([
      ...addedRows.map((r) => r.user_id),
      ...progressedRows.map((r) => r.user_id),
      ...diaryRows.map((r) => r.user_id),
      ...episodeRows.map((r) => r.user_id),
    ]),
  ];
  const { data: actors, error: actorsError } = actorIds.length
    ? await supabase
        .from("profile_identities")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", actorIds)
    : { data: [] as { user_id: string | null; username: string | null; display_name: string | null; avatar_url: string | null }[], error: null };
  if (actorsError) throw actorsError;
  const actorById = new Map(
    (actors ?? [])
      .filter(
        (a): a is typeof a & { user_id: string; username: string } =>
          a.user_id != null && a.username != null,
      )
      .map((a) => [a.user_id, a]),
  );

  const events: FeedEvent[] = [];

  for (const r of addedRows) {
    const actor = actorById.get(r.user_id);
    const catalog = catalogByKey.get(`${r.item_type}:${r.item_id}`);
    if (!actor || !catalog) continue;
    events.push({
      id: `library_entries:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "added",
      itemType: r.item_type,
      itemId: r.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      itemSubtitle: catalog.subtitle,
      entryStatus: r.status,
      eventDate: r.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: null,
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  for (const r of progressedRows) {
    const actor = actorById.get(r.user_id);
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (!actor || !it) continue;
    const catalog = catalogByKey.get(`${it.itemType}:${it.itemId}`);
    if (!catalog) continue;
    events.push({
      id: `progress_sessions:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "progressed",
      itemType: it.itemType,
      itemId: it.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      itemSubtitle: catalog.subtitle,
      entryStatus: null,
      eventDate: r.session_date,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: { durationMinutes: r.duration_minutes, note: r.note },
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  for (const r of diaryRows) {
    const actor = actorById.get(r.user_id);
    const it = itemByLibraryEntry.get(r.library_entry_id);
    if (!actor || !it) continue;
    const catalog = catalogByKey.get(`${it.itemType}:${it.itemId}`);
    if (!catalog) continue;
    events.push({
      id: `diary_entries:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(r.rating, r.review, "finished"),
      itemType: it.itemType,
      itemId: it.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      itemSubtitle: catalog.subtitle,
      entryStatus: null,
      eventDate: r.finished_on,
      rating: r.rating,
      reviewExcerpt: excerpt(r.review),
      episode: null,
      progress: null,
      interactionTarget: { targetType: "diary_entry", targetId: r.id },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  for (const r of episodeRows) {
    const actor = actorById.get(r.user_id);
    const catalog = catalogByKey.get(`series:${r.series_id}`);
    if (!actor || !catalog) continue;
    events.push({
      id: `episode_watches:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(r.rating, r.review, "watchedEpisode"),
      itemType: "series",
      itemId: r.series_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      itemSubtitle: catalog.subtitle,
      entryStatus: null,
      eventDate: r.watched_on,
      rating: r.rating,
      reviewExcerpt: excerpt(r.review),
      episode: {
        season: r.season_number,
        episode: r.episode_number,
        title:
          titleByEpisode.get(`${r.series_id}:${r.season_number}:${r.episode_number}`) ?? null,
      },
      progress: null,
      interactionTarget: { targetType: "episode_watch", targetId: r.id },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  // Orden total (fecha desc, id desc) — el desempate por id hace la paginación
  // determinista entre eventos con la misma fecha, en pareja con isAfterCursor.
  events.sort((a, b) => {
    if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  // Las queries usan `lte` (inclusivo), así que aquí se descarta lo ya servido
  // en páginas anteriores — incluido el propio evento del cursor.
  const fresh = cursor ? events.filter((e) => isAfterCursor(e, cursor)) : events;
  const page = fresh.slice(0, pageSize);

  // Interacciones de Bloque B, batch por tipo, solo para los eventos de esta
  // página que tienen target real.
  const diaryTargetIds = page
    .filter((e) => e.interactionTarget?.targetType === "diary_entry")
    .map((e) => e.interactionTarget!.targetId);
  const episodeTargetIds = page
    .filter((e) => e.interactionTarget?.targetType === "episode_watch")
    .map((e) => e.interactionTarget!.targetId);
  const [diarySummaries, episodeSummaries] = await Promise.all([
    getInteractionSummary(supabase, "diary_entry", diaryTargetIds),
    getInteractionSummary(supabase, "episode_watch", episodeTargetIds),
  ]);
  for (const e of page) {
    if (!e.interactionTarget) continue;
    const summaries =
      e.interactionTarget.targetType === "diary_entry" ? diarySummaries : episodeSummaries;
    const s = summaries.get(e.interactionTarget.targetId);
    if (s) {
      e.reactionCount = s.reactionCount;
      e.viewerReacted = s.viewerReacted;
      e.commentCount = s.commentCount;
      e.comments = s.comments;
    }
  }

  const last = page[page.length - 1];
  const nextCursor = allExhausted || !last
    ? null
    : `${last.eventDate}${CURSOR_SEPARATOR}${last.id}`;

  return { events: page, nextCursor };
}
