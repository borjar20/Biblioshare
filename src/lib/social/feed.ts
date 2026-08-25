import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { AnchorRef, AnchorType } from "@/lib/catalog/anchor";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";
import type { MediaStatus } from "@/lib/library/types";
import type { PostKind } from "./post-actions";
import {
  emptyReactions,
  type InteractionComment,
  type ReactionsByEmoji,
} from "./interactions";
import { getInteractionSummary } from "./get-interaction-summary";
import { resolveKnownMentions } from "./resolve-mentions";
import { getClubActivityEvents, type ClubFeedEvent } from "./club-feed";
import type { PersonGroupEntry } from "./group-feed-entries";
import {
  compareEntries,
  cursorSourceFilter,
  FEED_SOURCE_COLUMNS,
  isAfterCursor,
  makeCursor,
  parseCursor,
} from "./feed-order";

// Feed de actividad social (posts como capa canónica). Antes esto era un
// fan-out on-read sobre seis tablas fuente; ahora lee UNA tabla, `posts`
// (kind = thought|finished|progressed|started|dropped|watched), y mezcla la
// actividad de club como segunda fuente. El feed ordena por fecha de
// PUBLICACIÓN (`posts.created_at`), no por la fecha semántica backdateada: un
// terminado marcado «la semana pasada» aparece al publicarlo. Cada post es su
// propia tarjeta — sin agrupación de presentación, así que el cursor keyset es
// trivial `(created_at, id)` y el corte de página es un `slice(pageSize)`.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FeedVerb =
  // "added" ya no lo emite ningún post (añadir a la biblioteca no publica);
  // se conserva en la unión porque `shared-activity.ts` (compartir a un club,
  // Bloque F) sigue derivando previews desde las tablas fuente legadas.
  | "added"
  | "progressed"
  | "finished"
  | "rated"
  | "reviewed"
  | "watchedEpisode"
  | "started"
  | "dropped"
  | "thought";

export type FeedEvent = {
  id: string; // `posts:${postId}` en el feed; etiqueta de fuente en previews legadas
  // El id estable del post → ruta propia `/post/[id]` (deep-link de
  // notificaciones y superficie de lectura). Opcional: solo lo llevan los
  // eventos que salen de una fila `posts` (el feed). Las previews legadas
  // (`shared-activity`, que derivan de pases/sesiones/reseñas sin post) lo
  // omiten.
  postId?: string;
  // El `kind` crudo del post. El despacho de tarjeta (feed-item.tsx) enruta por
  // aquí; `verb` es una vista derivada de `kind`+reseña que conservan las
  // tarjetas existentes. Opcional por el mismo motivo que `postId`.
  kind?: PostKind;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  verb: FeedVerb;
  // itemType/itemId/itemTitle/itemCoverUrl/itemSubtitle: comunes a las tarjetas
  // de catálogo. Para "thought" el ancla real (polimórfica, puede ser
  // saga/persona) vive en `thought.anchor` — ItemType no puede representar
  // saga/persona, así que en esos casos itemType lleva un valor INERTE Y
  // POTENCIALMENTE FALSO (itemType:"book" con itemId = uuid de la saga). El
  // despacho del feed enruta verb:"thought" a su propia tarjeta ANTES de que
  // nada lea este par.
  itemType: ItemType;
  itemId: string;
  itemTitle: string;
  itemCoverUrl: string | null;
  itemSubtitle: string | null;
  // Estado del pase; lo informaba el verbo "added" (legado, sin uso en posts).
  entryStatus: MediaStatus | null;
  // Solo "added" (legado): pertenencia del visitante, resuelta por página.
  viewerHasActivePass?: boolean;
  // Autor o admin/moderador global: puede borrar el post. Resuelto por página en
  // un batch (`moderatable_target_ids('post', …)`), nunca un RPC por tarjeta.
  viewerCanDelete?: boolean;
  // Fecha de publicación (`posts.created_at`). Sirve al «hace x» de la tarjeta y
  // a las cabeceras de día del perfil. Con posts, orderDate === sortDate ===
  // eventDate: una sola columna timestamptz, sin la antigua sustitución de
  // `sessionRelativeBasis` (el feed ordena por publicación). Se conservan las
  // tres para no reescribir `shared-activity.ts` ni la unión `FeedEntry`.
  eventDate: string;
  orderDate: string;
  sortDate: string;
  rating: number | null;
  reviewExcerpt: string | null;
  episode: { season: number; episode: number; title: string | null } | null;
  // Meta de la tarjeta de reseña: solo `finished`. El resto va a null.
  reviewMeta: { readingDays: number | null; totalPages: number | null } | null;
  progress: {
    durationMinutes: number | null;
    page: number | null;
    percent: number | null;
    note: { body: string; isSpoiler: boolean } | null;
  } | null;
  // Solo `thought`: cuerpo + ancla polimórfica. El ancla NO vive en itemType/
  // itemId (ver comentario de arriba).
  thought: { body: string; isSpoiler: boolean; anchor: AnchorRef } | null;
  // El feed emite SIEMPRE `post` (el target canónico del post). Las previews
  // legadas siguen sirviendo `diary_entry`/`episode_watch` sobre las mismas
  // tarjetas, así que la unión los conserva.
  interactionTarget: {
    targetType: "post" | "diary_entry" | "episode_watch" | "pass" | "progress_session" | "thought";
    targetId: string;
    interactionTargetId: string;
  } | null;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByEmoji;
};

// Forma interna mientras se resuelve el target canónico en batch. Nunca cruza el
// límite del loader. Todo evento del feed sale de una fila `posts`, así que aquí
// `postId` es OBLIGATORIO (en la forma pública es opcional por las previews
// legadas) y el target es siempre `post`, aún sin resolver.
type FeedEventDraft = Omit<FeedEvent, "interactionTarget" | "postId"> & {
  postId: string;
  interactionTarget: {
    targetType: "post";
    targetId: string;
    interactionTargetId: string | null;
  } | null;
};

// El feed mezcla eventos de persona (un post) y de club (una actividad, que
// puede no tener ítem). En vez de forzar un ítem falso, la lista transporta la
// unión y cada tarjeta lee lo suyo. `person-group` lo produce solo el perfil
// (agrupación por día, `profile-feed-buckets.ts`); getFeed emite entradas
// singleton `person` y `club`.
export type FeedEntry =
  | { source: "person"; id: string; eventDate: string; orderDate: string; sortDate: string; event: FeedEvent }
  | PersonGroupEntry
  | { source: "club"; id: string; eventDate: string; orderDate: string; sortDate: string; event: ClubFeedEvent };

export type FeedPage = {
  events: FeedEntry[];
  nextCursor: string | null;
  knownUsernames: string[];
};

// El set del frame A. Selección única.
//   · book   → libros
//   · screen → "Pantalla": películas Y series
//   · reviews→ solo terminados con reseña
//   · clubs  → solo la actividad de tus clubes
export type FeedFilter = "reviews" | "book" | "screen" | "clubs";

export const FEED_FILTERS: readonly FeedFilter[] = ["reviews", "book", "screen", "clubs"];

export function parseFeedFilter(value: string | undefined): FeedFilter | undefined {
  return FEED_FILTERS.includes(value as FeedFilter) ? (value as FeedFilter) : undefined;
}

export type FeedOptions = {
  /** Cursor keyset opaco del último evento servido (formato en feed-order.ts). */
  cursor?: string;
  pageSize?: number;
  /** Sin filtro = todo. */
  filter?: FeedFilter;
  /**
   * Feed de un actor concreto (la pestaña Actividad del perfil): sirve los
   * posts de ESE usuario en vez de los de tus seguidos. Los clubes quedan fuera.
   */
  actorId?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const REVIEW_EXCERPT_LENGTH = 200;
const POST_COLUMNS =
  "id, author_id, kind, anchor_type, anchor_id, source_kind, source_id, body, is_spoiler, created_at";

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

// Ancla saga/persona no cabe en ItemType: cae a un placeholder inerte que el
// despacho de "thought" nunca lee (ver comentario de itemType en FeedEvent).
function itemTypeForAnchor(anchor: AnchorType): ItemType {
  return anchor === "saga" || anchor === "person" ? "book" : anchor;
}

// Menciones @usuario a resolver de un evento ya resuelto (cuerpo del pensamiento,
// excerpt de reseña, nota de progreso y comentarios prefetch).
function mentionTextsOf(event: { reviewExcerpt: string | null; thought: FeedEvent["thought"]; progress: FeedEvent["progress"]; comments: InteractionComment[] }): string[] {
  return [
    ...(event.reviewExcerpt ? [event.reviewExcerpt] : []),
    ...(event.thought?.body ? [event.thought.body] : []),
    ...(event.progress?.note?.body ? [event.progress.note.body] : []),
    ...event.comments.map((c) => c.body),
  ];
}

// Resuelve en batch el catálogo del ancla + las filas fuente para display
// (pass/pass_reviews en finished, progress_sessions en progressed,
// episode_watches en watched) + las identidades de actor, y construye un draft
// por post. Compartido por el feed (`getFeed`) y la ruta `/post/[id]`
// (`getPostEvent`) para no duplicar el mapeo por kind. Descarta un post cuyo
// autor o ancla no resuelvan, y —si `reviewsOnly`— un `finished` sin reseña.
async function resolvePostDrafts(
  supabase: SupabaseServerClient,
  postRows: PostRow[],
  reviewsOnly: boolean,
): Promise<FeedEventDraft[]> {
  if (postRows.length === 0) return [];

  const anchorIdsByType: Record<AnchorType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
    saga: new Set(),
    person: new Set(),
  };
  for (const r of postRows) anchorIdsByType[r.anchor_type].add(r.anchor_id);

  const finishedSourceIds = postRows
    .filter((r) => r.kind === "finished" && r.source_kind === "pass" && r.source_id)
    .map((r) => r.source_id!);
  const progressedSourceIds = postRows
    .filter((r) => r.kind === "progressed" && r.source_kind === "progress_session" && r.source_id)
    .map((r) => r.source_id!);
  const watchedSourceIds = postRows
    .filter((r) => r.kind === "watched" && r.source_kind === "episode_watch" && r.source_id)
    .map((r) => r.source_id!);

  const [books, movies, series, sagas, people, passRows, reviewRows, sessionRows, episodeRows] =
    await Promise.all([
      anchorIdsByType.book.size
        ? supabase.from("books").select("id, title, author, cover_url, total_pages").in("id", [...anchorIdsByType.book])
        : Promise.resolve({ data: [] as BookRow[], error: null }),
      anchorIdsByType.movie.size
        ? supabase.from("movies").select("id, title, cover_url").in("id", [...anchorIdsByType.movie])
        : Promise.resolve({ data: [] as ScreenRow[], error: null }),
      anchorIdsByType.series.size
        ? supabase.from("series").select("id, title, cover_url").in("id", [...anchorIdsByType.series])
        : Promise.resolve({ data: [] as ScreenRow[], error: null }),
      anchorIdsByType.saga.size
        ? supabase.from("sagas").select("id, name, cover_url").in("id", [...anchorIdsByType.saga])
        : Promise.resolve({ data: [] as NamedRow[], error: null }),
      anchorIdsByType.person.size
        ? supabase.from("people").select("id, name, photo_url").in("id", [...anchorIdsByType.person])
        : Promise.resolve({ data: [] as PersonRow[], error: null }),
      finishedSourceIds.length
        ? supabase.from("passes").select("id, started_on, finished_on, rating").in("id", finishedSourceIds)
        : Promise.resolve({ data: [] as PassRow[], error: null }),
      finishedSourceIds.length
        ? supabase.from("pass_reviews").select("id, review").in("id", finishedSourceIds)
        : Promise.resolve({ data: [] as { id: string | null; review: string | null }[], error: null }),
      progressedSourceIds.length
        ? supabase.from("progress_sessions").select("id, duration_minutes, position").in("id", progressedSourceIds)
        : Promise.resolve({ data: [] as SessionRow[], error: null }),
      watchedSourceIds.length
        ? supabase
            .from("episode_watches")
            .select("id, series_id, season_number, episode_number, rating, review")
            .in("id", watchedSourceIds)
        : Promise.resolve({ data: [] as EpisodeRow[], error: null }),
    ]);
  for (const r of [books, movies, series, sagas, people, passRows, reviewRows, sessionRows, episodeRows]) {
    if (r.error) throw r.error;
  }

  const catalogByKey = new Map<
    string,
    { title: string; coverUrl: string | null; subtitle: string | null; totalPages: number | null }
  >();
  for (const r of books.data ?? [])
    catalogByKey.set(`book:${r.id}`, {
      title: r.title ?? UNTITLED_FALLBACK,
      coverUrl: r.cover_url,
      subtitle: r.author,
      totalPages: r.total_pages,
    });
  for (const r of movies.data ?? [])
    catalogByKey.set(`movie:${r.id}`, {
      title: r.title ?? UNTITLED_FALLBACK,
      coverUrl: r.cover_url,
      subtitle: null,
      totalPages: null,
    });
  for (const r of series.data ?? [])
    catalogByKey.set(`series:${r.id}`, {
      title: r.title ?? UNTITLED_FALLBACK,
      coverUrl: r.cover_url,
      subtitle: null,
      totalPages: null,
    });
  for (const r of sagas.data ?? [])
    catalogByKey.set(`saga:${r.id}`, { title: r.name, coverUrl: r.cover_url, subtitle: null, totalPages: null });
  for (const r of people.data ?? [])
    catalogByKey.set(`person:${r.id}`, { title: r.name, coverUrl: r.photo_url, subtitle: null, totalPages: null });

  function anchorFor(type: AnchorType, id: string): AnchorRef | null {
    const meta = catalogByKey.get(`${type}:${id}`);
    if (!meta) return null;
    return { type, id, title: meta.title, imageUrl: meta.coverUrl, subtitle: meta.subtitle };
  }

  const passById = new Map((passRows.data ?? []).map((r) => [r.id, r]));
  const reviewById = new Map((reviewRows.data ?? []).map((r) => [r.id, r.review]));
  const sessionById = new Map((sessionRows.data ?? []).map((r) => [r.id, r]));
  const episodeById = new Map((episodeRows.data ?? []).map((r) => [r.id, r]));

  const episodeSeriesIds = [...new Set((episodeRows.data ?? []).map((r) => r.series_id))];
  const { data: episodeTitles, error: episodeTitlesError } = episodeSeriesIds.length
    ? await supabase
        .from("series_episodes")
        .select("series_id, season_number, episode_number, title")
        .in("series_id", episodeSeriesIds)
    : { data: [] as EpisodeTitleRow[], error: null };
  if (episodeTitlesError) throw episodeTitlesError;
  const titleByEpisode = new Map(
    (episodeTitles ?? []).map((e) => [`${e.series_id}:${e.season_number}:${e.episode_number}`, e.title]),
  );

  const actorIds = [...new Set(postRows.map((r) => r.author_id))];
  const { data: actors, error: actorsError } = actorIds.length
    ? await supabase
        .from("profile_identities")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", actorIds)
    : { data: [] as ActorRow[], error: null };
  if (actorsError) throw actorsError;
  const actorById = new Map(
    (actors ?? [])
      .filter((a): a is ActorRow & { user_id: string; username: string } => a.user_id != null && a.username != null)
      .map((a) => [a.user_id, a]),
  );

  const drafts: FeedEventDraft[] = [];
  for (const r of postRows) {
    const actor = actorById.get(r.author_id);
    if (!actor) continue;
    const anchor = anchorFor(r.anchor_type, r.anchor_id);
    // Ancla borrada (obra eliminada) ⇒ se descarta el evento.
    if (!anchor) continue;

    // "Reseñas": el kind ya es 'finished' (filtro SQL); aquí se descarta el
    // terminado SIN texto visible. Se hace tras resolver el pase.
    const pass = r.source_id ? passById.get(r.source_id) : undefined;
    const reviewText = r.kind === "finished" && r.source_id ? reviewById.get(r.source_id) ?? null : null;
    if (reviewsOnly && (reviewText ?? "").trim() === "") continue;

    const base = {
      id: `posts:${r.id}`,
      postId: r.id,
      kind: r.kind,
      actorId: r.author_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      itemType: itemTypeForAnchor(r.anchor_type),
      itemId: r.anchor_id,
      itemTitle: anchor.title,
      itemCoverUrl: anchor.imageUrl,
      itemSubtitle: anchor.subtitle,
      entryStatus: null,
      eventDate: r.created_at,
      orderDate: r.created_at,
      sortDate: r.created_at,
      rating: null as number | null,
      reviewExcerpt: null as string | null,
      episode: null as FeedEvent["episode"],
      reviewMeta: null as FeedEvent["reviewMeta"],
      progress: null as FeedEvent["progress"],
      thought: null as FeedEvent["thought"],
      interactionTarget: { targetType: "post" as const, targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
      reactions: emptyReactions(),
    };

    if (r.kind === "thought") {
      drafts.push({ ...base, verb: "thought", thought: { body: r.body ?? "", isSpoiler: r.is_spoiler, anchor } });
      continue;
    }
    if (r.kind === "finished") {
      const totalPages = catalogByKey.get(`${r.anchor_type}:${r.anchor_id}`)?.totalPages ?? null;
      drafts.push({
        ...base,
        verb: verbForReviewable(pass?.rating ?? null, reviewText, "finished"),
        rating: pass?.rating ?? null,
        reviewExcerpt: excerpt(reviewText),
        reviewMeta: {
          readingDays:
            r.anchor_type === "book" && pass?.started_on && pass?.finished_on
              ? Math.max(1, Math.round((Date.parse(pass.finished_on) - Date.parse(pass.started_on)) / 86_400_000) + 1)
              : null,
          totalPages,
        },
      });
      continue;
    }
    if (r.kind === "progressed") {
      const session = r.source_id ? sessionById.get(r.source_id) : undefined;
      const pos = (session?.position ?? {}) as { page?: number; season?: number; episode?: number };
      const page = typeof pos.page === "number" ? pos.page : null;
      const totalPages = catalogByKey.get(`${r.anchor_type}:${r.anchor_id}`)?.totalPages ?? null;
      const percent = page != null && totalPages ? Math.min(100, Math.round((page / totalPages) * 100)) : null;
      // Series: el avance es por episodio, no por página ni minutos. La sesión
      // guarda position={season, episode} (episodio más alto marcado) y la
      // tarjeta lo pinta "S#E#", igual que un 'watched'. Sin este mapeo el post
      // caía a `minutesLogged(0)` = "0 minutos registrados" (bug Futurama).
      const seriesEpisode =
        r.anchor_type === "series" && typeof pos.season === "number" && typeof pos.episode === "number"
          ? { season: pos.season, episode: pos.episode, title: null }
          : null;
      drafts.push({
        ...base,
        verb: "progressed",
        episode: seriesEpisode,
        progress: {
          durationMinutes: session?.duration_minutes ?? null,
          page,
          percent,
          // El cuerpo del post ES la nota pública (backfill) o el comentario al
          // compartir; la copia privada de la sesión nunca se sirve.
          note: r.body ? { body: r.body, isSpoiler: r.is_spoiler } : null,
        },
      });
      continue;
    }
    if (r.kind === "watched") {
      const ep = r.source_id ? episodeById.get(r.source_id) : undefined;
      drafts.push({
        ...base,
        verb: verbForReviewable(ep?.rating ?? null, ep?.review ?? null, "watchedEpisode"),
        rating: ep?.rating ?? null,
        reviewExcerpt: excerpt(ep?.review ?? null),
        episode: ep
          ? {
              season: ep.season_number,
              episode: ep.episode_number,
              title: titleByEpisode.get(`${ep.series_id}:${ep.season_number}:${ep.episode_number}`) ?? null,
            }
          : null,
      });
      continue;
    }
    // started / dropped: hito sin display extra.
    drafts.push({ ...base, verb: r.kind === "started" ? "started" : "dropped" });
  }

  return drafts;
}

// Resuelve borrado (dueño o admin/moderador global, un batch) e interacciones
// (Bloque B) sobre un conjunto de drafts, MUTÁNDOLOS in-place. Sin viewer,
// `viewerCanDelete` queda undefined (falsy).
async function resolvePostInteractions(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  drafts: FeedEventDraft[],
): Promise<void> {
  if (drafts.length === 0) return;

  if (viewerId) {
    const { data: moderatablePostIds, error: moderatableError } = await supabase.rpc("moderatable_target_ids", {
      candidate_target_type: "post",
      candidate_target_ids: drafts.map((e) => e.postId),
    });
    if (moderatableError) throw moderatableError;
    const moderatable = new Set((moderatablePostIds ?? []) as string[]);
    for (const e of drafts) {
      e.viewerCanDelete = e.actorId === viewerId || moderatable.has(e.postId);
    }
  }

  const summaries = await getInteractionSummary(supabase, "post", drafts.map((e) => e.postId));
  for (const e of drafts) {
    if (!e.interactionTarget) continue;
    const s = summaries.get(e.interactionTarget.targetId);
    if (!s) throw new Error(`Interaction summary missing for post:${e.interactionTarget.targetId}`);
    e.interactionTarget.interactionTargetId = s.interactionTargetId;
    e.reactionCount = s.reactionCount;
    e.viewerReacted = s.viewerReacted;
    e.commentCount = s.commentCount;
    e.comments = s.comments;
    e.reactions = s.reactions;
  }
}

function finalizePostDraft(draft: FeedEventDraft): FeedEvent {
  const target = draft.interactionTarget;
  if (target && target.interactionTargetId === null) {
    throw new Error(`Interaction target unresolved for post:${target.targetId}`);
  }
  return {
    ...draft,
    interactionTarget: target ? { ...target, interactionTargetId: target.interactionTargetId! } : null,
  };
}

export async function getFeed(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  options: FeedOptions = {},
): Promise<FeedPage> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  // Sin agrupación, `pageSize + 1` basta: la fila extra por fuente solo sirve
  // para detectar «hay más» (ver `allExhausted` abajo).
  const fetchLimit = pageSize + 1;
  const cursor = options.cursor ? parseCursor(options.cursor) : null;

  const actorId = options.actorId;
  const isActorFeed = actorId != null;

  const filter = options.filter;
  const reviewsOnly = filter === "reviews";
  // "Pantalla" no es un anchor_type: son dos. saga/persona (pensamientos) no
  // sobreviven a book/screen — solo aparecen en la vista "todo".
  const anchorTypes: AnchorType[] | undefined =
    filter === "book" ? ["book"] : filter === "screen" ? ["movie", "series"] : undefined;
  const includePosts = filter !== "clubs";
  // Los clubes son del visitante, no de la persona del perfil: fuera del feed de
  // actor. Y no son un anchor_type, así que no sobreviven a "Libros"/"Pantalla".
  const includeClubs =
    viewerId !== null && !isActorFeed && (filter === undefined || filter === "clubs");

  const [followResult, clubResult] = await Promise.all([
    includePosts && !isActorFeed && viewerId !== null
      ? supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", viewerId)
          .eq("status", "accepted")
      : Promise.resolve({ data: [] as { followee_id: string }[], error: null }),
    includeClubs && viewerId !== null
      ? getClubActivityEvents(supabase, viewerId, {
          cursorFilter: cursor ? cursorSourceFilter(FEED_SOURCE_COLUMNS.clubs, cursor) : undefined,
          pageSize: fetchLimit,
        })
      : Promise.resolve({ events: [] as ClubFeedEvent[], rowCount: 0 }),
  ]);
  if (followResult.error) throw followResult.error;

  // Feed de actor: solo sus posts. Feed personal: los tuyos ∪ los de tus
  // seguidos; `follows` nunca te devuelve a ti mismo, así que te añades a mano.
  // No hay exclusión de "added": añadir no publica, así que un import en masa no
  // crea posts y no puede inundar la primera página (garantía del writer, Task 9).
  const authorIds = isActorFeed
    ? [actorId]
    : [...(viewerId ? [viewerId] : []), ...(followResult.data ?? []).map((f) => f.followee_id)];
  const includePersons = includePosts && authorIds.length > 0;
  if (!includePersons && clubResult.events.length === 0) {
    return { events: [], nextCursor: null, knownUsernames: [] };
  }

  const { data: postRowsRaw, error: postsError } = includePersons
    ? await (() => {
        let q = supabase
          .from("posts")
          .select(POST_COLUMNS)
          .in("author_id", authorIds)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(fetchLimit);
        if (anchorTypes) q = q.in("anchor_type", anchorTypes);
        // "Reseñas" = terminados con texto. El kind se filtra en SQL; el texto
        // (que vive en el pase, con su privacidad) se filtra tras resolverlo.
        if (reviewsOnly) q = q.eq("kind", "finished");
        if (cursor) q = q.or(cursorSourceFilter(FEED_SOURCE_COLUMNS.posts, cursor));
        return q;
      })()
    : { data: [] as PostRow[], error: null };
  if (postsError) throw postsError;
  const postRows = (postRowsRaw ?? []) as PostRow[];

  const drafts = await resolvePostDrafts(supabase, postRows, reviewsOnly);

  // --- Mezcla, orden y corte de página ----------------------------------------

  const entries: Array<
    | { source: "person"; id: string; eventDate: string; orderDate: string; sortDate: string; event: FeedEventDraft }
    | { source: "club"; id: string; eventDate: string; orderDate: string; sortDate: string; event: ClubFeedEvent }
  > = [
    ...drafts.map(
      (event) => ({ source: "person", id: event.id, eventDate: event.eventDate, orderDate: event.orderDate, sortDate: event.sortDate, event }) as const,
    ),
    ...clubResult.events.map(
      (event) => ({ source: "club", id: event.id, eventDate: event.eventDate, orderDate: event.eventDate, sortDate: event.eventDate, event }) as const,
    ),
  ];

  // Orden total (día desc, instante desc, id desc) — espejo de `isAfterCursor`.
  // Cada post es una tarjeta y ninguna se solapa, así que el corte es un slice.
  entries.sort(compareEntries);
  const fresh = cursor ? entries.filter((e) => isAfterCursor(e, cursor)) : entries;
  const page = fresh.slice(0, pageSize);

  // Interacciones y borrado solo para los posts de ESTA página (referencias a
  // los mismos drafts, así que finalizarlos abajo ya los ve resueltos).
  const personDrafts = page.filter((e) => e.source === "person").map((e) => e.event);
  await resolvePostInteractions(supabase, viewerId, personDrafts);

  const finalizedPage: FeedEntry[] = page.map((entry) =>
    entry.source === "club"
      ? entry
      : {
          source: "person",
          id: entry.id,
          eventDate: entry.eventDate,
          orderDate: entry.orderDate,
          sortDate: entry.sortDate,
          event: finalizePostDraft(entry.event),
        },
  );

  // El feed se agota solo cuando ambas fuentes trajeron menos que el fetch Y se
  // sirvió todo lo fresco. Si una fuente topó su límite, o quedaron filas sin
  // servir tras el slice, hay más y el cursor es el keyset de la última servida.
  const allExhausted = postRows.length < fetchLimit && clubResult.rowCount < fetchLimit;
  const servedAll = page.length >= fresh.length;
  const last = page[page.length - 1];
  const nextCursor = (allExhausted && servedAll) || !last ? null : makeCursor(last);

  const knownUsernames = await resolveKnownMentions(
    supabase,
    personDrafts.flatMap((e) => mentionTextsOf(e)),
  );

  return { events: finalizedPage, nextCursor, knownUsernames };
}

// Carga UN post por id para la ruta `/post/[id]`. La RLS de `posts` gatea la
// visibilidad (audiencia = perfil), así que "no visible" y "no existe" vuelven
// igual: `null` → la page hace `notFound()`. Reutiliza la MISMA resolución que
// el feed (`resolvePostDrafts`/`resolvePostInteractions`), de modo que la
// tarjeta y su hilo se pintan idénticos a como salen en el feed.
export async function getPostEvent(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  postId: string,
): Promise<{ event: FeedEvent; knownUsernames: string[] } | null> {
  const { data, error } = await supabase.from("posts").select(POST_COLUMNS).eq("id", postId).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const drafts = await resolvePostDrafts(supabase, [data as PostRow], false);
  // Ancla o autor no resolubles ⇒ nada que pintar (mismo criterio que el feed).
  if (drafts.length === 0) return null;

  await resolvePostInteractions(supabase, viewerId, drafts);
  const event = finalizePostDraft(drafts[0]);
  const knownUsernames = await resolveKnownMentions(supabase, mentionTextsOf(event));
  return { event, knownUsernames };
}

// --- Contexto de descubrimiento de `/post/[id]` (posts Spec 2b, Propuesta B) ---
// Enriquece la página del post para que no quede vacía: otros posts DEL AUTOR y
// otros posts SOBRE LA MISMA OBRA (de otra gente). No lleva interacciones (los
// mini-cards no las pintan), así que evita el batch de reacciones/comentarios.
// La RLS de `posts` filtra por audiencia: un tercero solo ve lo que puede ver.
//
// Los AVANCES (`kind = 'progressed'`) quedan FUERA de los dos raíles: son un
// latido de lectura, no una pieza de conversación, y como una misma persona
// genera decenas sobre la MISMA obra, saturaban el bloque con posts del mismo
// ítem y el descubrimiento dejaba de descubrir. En «Más de {usuario}» el filtro
// vive en la RPC (20260879) para que el `limit` cuente candidatos válidos; en
// «Más sobre la obra», en el `.neq` de la consulta de abajo.
export type RelatedPost = {
  postId: string;
  kind: PostKind;
  itemTitle: string;
  itemCoverUrl: string | null;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
};

export type PostContext = {
  moreByAuthor: RelatedPost[];
  moreAboutWork: RelatedPost[];
};

const RELATED_LIMIT = 4;

function toRelatedPost(d: FeedEventDraft): RelatedPost {
  return {
    postId: d.postId,
    kind: d.kind!, // resolvePostDrafts siempre lo informa (base.kind = r.kind)
    itemTitle: d.itemTitle,
    itemCoverUrl: d.itemCoverUrl,
    authorUsername: d.actorUsername,
    authorDisplayName: d.actorDisplayName,
    authorAvatarUrl: d.actorAvatarUrl,
  };
}

export async function getPostContext(
  supabase: SupabaseServerClient,
  event: FeedEvent,
): Promise<PostContext> {
  const empty: PostContext = { moreByAuthor: [], moreAboutWork: [] };
  if (!event.postId) return empty;
  // Ancla REAL de la obra: para un pensamiento vive en `thought.anchor`
  // (itemType/itemId son un placeholder inerte, ver FeedEvent); para el resto,
  // el par itemType/itemId ES el ancla de catálogo.
  const anchorType: AnchorType = event.thought?.anchor.type ?? event.itemType;
  const anchorId = event.thought?.anchor.id ?? event.itemId;

  // Se pide un pequeño excedente sobre RELATED_LIMIT: `resolvePostDrafts`
  // descarta posts con ancla/autor no resolubles, y así el corte no se queda
  // corto por uno descartado.
  const fetchLimit = RELATED_LIMIT + 2;
  const [byAuthor, aboutWork] = await Promise.all([
    // "Más de {usuario}" por CONTINUIDAD TEMÁTICA: no los más recientes a secas,
    // sino los del autor sobre obras EMPARENTADAS con la del post actual
    // (misma saga > misma obra > géneros compartidos), rellenando con recientes
    // si no hay bastante. El ranking vive en SQL (`related_posts_by_author`,
    // 20260851) — un round-trip, usa el índice GIN de géneros, y devuelve
    // `setof posts` para reusar `resolvePostDrafts`, que conserva el orden. RLS
    // de `posts` sigue filtrando audiencia (la función es SECURITY INVOKER).
    supabase.rpc("related_posts_by_author", {
      p_author_id: event.actorId,
      p_anchor_type: anchorType,
      p_anchor_id: anchorId,
      p_exclude_post_id: event.postId,
      p_limit: fetchLimit,
    }),
    supabase
      .from("posts")
      .select(POST_COLUMNS)
      .eq("anchor_type", anchorType)
      .eq("anchor_id", anchorId)
      .neq("author_id", event.actorId)
      .neq("id", event.postId)
      .neq("kind", "progressed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(fetchLimit),
  ]);
  if (byAuthor.error) throw byAuthor.error;
  if (aboutWork.error) throw aboutWork.error;

  const [byAuthorDrafts, aboutWorkDrafts] = await Promise.all([
    resolvePostDrafts(supabase, (byAuthor.data ?? []) as PostRow[], false),
    resolvePostDrafts(supabase, (aboutWork.data ?? []) as PostRow[], false),
  ]);

  // Segundo cinturón para los avances: si la base a la que apunta este entorno
  // aún corre la versión previa de `related_posts_by_author` (el ledger de
  // migraciones NO prueba qué hay desplegado), el raíl seguiría colándolos.
  const sinAvances = (drafts: FeedEventDraft[]) => drafts.filter((d) => d.kind !== "progressed");

  return {
    moreByAuthor: sinAvances(byAuthorDrafts).slice(0, RELATED_LIMIT).map(toRelatedPost),
    moreAboutWork: sinAvances(aboutWorkDrafts).slice(0, RELATED_LIMIT).map(toRelatedPost),
  };
}

// --- Tipos de fila de las queries (Supabase no los infiere del builder) --------
type PostRow = {
  id: string;
  author_id: string;
  kind: PostKind;
  anchor_type: AnchorType;
  anchor_id: string;
  source_kind: "pass" | "progress_session" | "episode_watch" | null;
  source_id: string | null;
  body: string | null;
  is_spoiler: boolean;
  created_at: string;
};
type BookRow = { id: string; title: string | null; author: string | null; cover_url: string | null; total_pages: number | null };
type ScreenRow = { id: string; title: string | null; cover_url: string | null };
type NamedRow = { id: string; name: string; cover_url: string | null };
type PersonRow = { id: string; name: string; photo_url: string | null };
type PassRow = { id: string; started_on: string | null; finished_on: string | null; rating: number | null };
type SessionRow = { id: string; duration_minutes: number | null; position: unknown };
type EpisodeRow = { id: string; series_id: string; season_number: number; episode_number: number; rating: number | null; review: string | null };
type EpisodeTitleRow = { series_id: string; season_number: number; episode_number: number; title: string | null };
type ActorRow = { user_id: string | null; username: string | null; display_name: string | null; avatar_url: string | null };
