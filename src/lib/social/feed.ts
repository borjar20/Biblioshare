import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { AnchorRef, AnchorType } from "@/lib/catalog/anchor";
import type { MediaStatus } from "@/lib/library/types";
import {
  emptyReactions,
  getInteractionSummary,
  type InteractionComment,
  type ReactionsByKind,
} from "./interactions";
import { resolveKnownMentions } from "./resolve-mentions";
import { getClubActivityEvents, type ClubFeedEvent } from "./club-feed";
import { sessionRelativeBasis } from "@/lib/sessions/session-relative-basis";
import { groupPersonEntries, descriptorForEvent, type PersonGroupEntry } from "./group-feed-entries";
import { planFeedPageCut } from "./feed-paging";
import {
  compareEntries,
  cursorSourceFilter,
  FEED_SOURCE_COLUMNS,
  isAfterCursor,
  makeCursor,
  parseCursor,
} from "./feed-order";

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
  | "watchedEpisode"
  | "thought";

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
  // itemType/itemId/itemTitle/itemCoverUrl/itemSubtitle: comunes al resto de
  // verbos. Para "thought" el ancla real (polimórfica, puede ser saga/persona)
  // vive en `thought.anchor` de abajo, NO aquí — ItemType no puede representar
  // saga/persona, así que para esos casos itemType lleva un valor INERTE Y
  // POTENCIALMENTE FALSO (ver el bucle de `thoughtRows` en getFeed): un
  // pensamiento anclado a una saga lleva itemType:"book" con itemId = el uuid
  // de la saga. Esto NO es inofensivo por construcción — un consumidor que no
  // sepa distinguir el verbo "thought" y llame a `itemHref(itemType, itemId)`
  // genera un enlace roto a una ficha de libro inexistente. El despacho del
  // feed (`src/components/social/feed-item.tsx`) tiene que enrutar
  // verb:"thought" a su propia tarjeta ANTES de cualquier catch-all que lea
  // estos campos — placeholder hoy, `<ThoughtCard>` en la Fase 5 (Task 5.3).
  itemSubtitle: string | null;
  // Estado del pase; solo informa el verbo "added".
  entryStatus: MediaStatus | null;
  // Solo para `added`: pertenencia del visitante actual, resuelta por página.
  viewerHasActivePass?: boolean;
  // Solo para `thought` (task-delete, #525): autor o admin global, resuelto
  // por página igual que viewerHasActivePass -- batch sobre moderatable_target_ids,
  // no un RPC por tarjeta. undefined para el resto de verbos.
  viewerCanDelete?: boolean;
  // Fecha SEMÁNTICA, solo para presentación: el «hace x» de la tarjeta y la
  // ventana de agrupación. Puede llevar la sustitución de
  // `sessionRelativeBasis`, así que NO existe como columna y NO ordena.
  eventDate: string;
  // Columna de fecha de la fuente, EN CRUDO: el primer componente de la clave
  // de orden (ver feed-order.ts). Existe tal cual en la tabla, que es lo que
  // permite que el filtro SQL de cada query sea el espejo exacto de
  // `isAfterCursor` en vez de una aproximación.
  orderDate: string;
  // Hora real de registro. SIEMPRE presente: es el segundo componente de la
  // clave de orden. `orderDate` puede ser date-only —finished_on, watched_on,
  // session_date— y por sí solo no distingue dos eventos del mismo día.
  sortDate: string;
  rating: number | null;
  reviewExcerpt: string | null;
  episode: { season: number; episode: number; title: string | null } | null;
  // Meta de la tarjeta de reseña (variant C): solo se rellena para
  // finished/rated/reviewed (bucle de diary). El resto de verbos van a null.
  reviewMeta: { readingDays: number | null; totalPages: number | null } | null;
  // `progress_sessions.note` (la copia privada) NUNCA se sirve aquí, a
  // propósito: sigue sin política de lectura pública — es el "por ahora nadie
  // más la ve" que promete el compositor. El texto que SÍ se sirve es la fila
  // de `notes` que el usuario haya marcado pública (`notes.is_public = true`,
  // política de Task 1), resuelta en un batch aparte por `session_id` — nunca
  // esta columna.
  progress: {
    durationMinutes: number | null;
    page: number | null;      // position.page de la sesión (libros)
    percent: number | null;   // page / books.total_pages * 100, si ambos existen
    note: { body: string; isSpoiler: boolean } | null; // nota PÚBLICA (notes.is_public)
  } | null;
  // Solo para verb "thought" (Fase 3, «Pensamiento»): cuerpo + ancla
  // polimórfica resuelta en batch por getFeed. Ver el comentario de arriba
  // sobre itemType/itemId para por qué el ancla NO vive ahí.
  thought: { body: string; isSpoiler: boolean; anchor: AnchorRef } | null;
  interactionTarget: {
    targetType: "diary_entry" | "episode_watch" | "pass" | "progress_session" | "thought";
    targetId: string;
    interactionTargetId: string;
  } | null;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByKind;
};

// Forma exclusivamente interna mientras getFeed agrupa las filas fuente y
// resuelve los targets en batch. Nunca cruza el límite del loader: la forma
// pública de arriba exige el UUID canónico para todo evento interactivo.
type FeedEventDraft = Omit<FeedEvent, "interactionTarget"> & {
  interactionTarget: {
    targetType: "diary_entry" | "episode_watch" | "pass" | "progress_session" | "thought";
    targetId: string;
    interactionTargetId: string | null;
  } | null;
};

// El feed mezcla dos cosas que no comparten forma: los eventos de personas
// (siempre sobre un ítem del catálogo) y los de club (una actividad, que puede
// no tener ítem — una tierlist, un reto). En vez de forzar un ítem falso en el
// evento de club, la lista transporta la unión y cada tarjeta lee lo suyo.
export type FeedEntry =
  | { source: "person"; id: string; eventDate: string; orderDate: string; sortDate: string; event: FeedEvent }
  | PersonGroupEntry
  | { source: "club"; id: string; eventDate: string; orderDate: string; sortDate: string; event: ClubFeedEvent };

export type FeedPage = {
  events: FeedEntry[];
  nextCursor: string | null;
  // Usernames @mencionados (en reviewExcerpt y en los comentarios de los
  // eventos de persona de esta página) que existen de verdad — resuelto en
  // UNA query. Los eventos de club (ClubFeedCard) no están cableados a
  // MentionText (fuera de alcance de la Tarea 7).
  knownUsernames: string[];
};

// El set del frame A. Es de selección única: "Reseñas" ya no se combina con un
// tipo como hacía el antiguo reviewsOnly.
//   · book   → libros
//   · screen → "Pantalla": películas Y series juntas
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
   * Feed de un actor concreto (la pestaña Actividad del perfil, plan 05 P4):
   * se salta la consulta de `follows` y sirve los eventos de ESE usuario en
   * vez de los de tus seguidos. Los clubes quedan fuera — la Actividad de un
   * perfil es lo que esa persona hizo con sus obras, no sus clubes.
   */
  actorId?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const REVIEW_EXCERPT_LENGTH = 200;

// El orden total, el formato del cursor y el filtro de las queries viven en
// `./feed-order` (módulo puro, con sus propios tests): la clave de orden, el
// filtro SQL y `isAfterCursor` tienen que moverse siempre juntos, o la
// paginación pierde o repite filas sin romper ningún tipo.

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
  viewerId: string | null,
  options: FeedOptions = {},
): Promise<FeedPage> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  // La agrupación colapsa varias filas en una tarjeta, así que para completar
  // una tarjeta de N miembros hacen falta N filas dentro del fetch. Se pide el
  // doble de `pageSize` por fuente: da holgura para grupos de hasta ~2×pageSize
  // sin partirlos (un import de docenas de títulos cabe). Un grupo aún mayor es
  // el residuo acotado de #391. Si una tarjeta toca el límite del fetch,
  // `planFeedPageCut` la retiene hasta la siguiente tanda (por `openTailIds`).
  const fetchLimit = pageSize * 2;
  const cursor = options.cursor ? parseCursor(options.cursor) : null;

  const actorId = options.actorId;
  const isActorFeed = actorId != null;

  const filter = options.filter;
  const reviewsOnly = filter === "reviews";
  // "Pantalla" es un filtro de la maqueta, no un item_type: son dos.
  const itemTypes: ItemType[] | undefined =
    filter === "book" ? ["book"] : filter === "screen" ? ["movie", "series"] : undefined;
  const includePeople = filter !== "clubs";
  // Los eventos de club no son de un tipo de ítem, así que no sobreviven a
  // "Libros" ni a "Pantalla"; y no son reseñas. En el feed de un actor tampoco:
  // los clubes son del visitante, no de la persona del perfil.
  const includeClubs =
    viewerId !== null &&
    !isActorFeed &&
    (filter === undefined || filter === "clubs");

  const [followResult, clubResult] = await Promise.all([
    includePeople && !isActorFeed && viewerId !== null
      ? supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", viewerId)
          .eq("status", "accepted")
      : Promise.resolve({ data: [] as { followee_id: string }[], error: null }),
    includeClubs
      ? getClubActivityEvents(supabase, viewerId, {
          // Un evento de club tiene orderDate === sortDate === created_at
          // (club-feed.ts), la MISMA forma que la fuente `added`.
          cursorFilter: cursor
            ? cursorSourceFilter(FEED_SOURCE_COLUMNS.clubs, cursor)
            : undefined,
          pageSize: fetchLimit,
        })
      : Promise.resolve({ events: [] as ClubFeedEvent[], rowCount: 0 }),
  ]);
  if (followResult.error) throw followResult.error;

  // Feed de actor: la fuente son sus propios eventos, no los de tus seguidos.
  // En el feed personal (Inicio) el visitante entra como una fuente más: tu
  // Inicio es "lo mío y lo de mi gente", no solo lo de los demás. `follows`
  // nunca te devuelve a ti mismo (su filtro es `follower_id = viewerId`), así
  // que hay que añadirse a mano.
  const followedIds = isActorFeed
    ? [actorId]
    : [
        ...(viewerId ? [viewerId] : []),
        ...(followResult.data ?? []).map((f) => f.followee_id),
      ];
  // Tus propias ALTAS son la excepción: un import en masa mete cientos de pases
  // en el mismo instante y, como la agrupación es de presentación y se aplica
  // DESPUÉS del corte a pageSize, esos pases ocupan la primera página entera y
  // tapan todo lo demás (medido: un import de 126 títulos se llevaba 18 de los
  // 20 huecos). Además es lo menos informativo que puedes ver de ti mismo: que
  // añadiste algo ya lo sabes. Tus sesiones, terminados/reseñas y episodios sí
  // entran. En el feed de un actor no aplica: ahí SÍ se ven sus altas.
  // Esto es el parche del síntoma; la causa (agrupar después de paginar) es
  // preexistente y vive en issue #391 — si se arregla, reconsiderar la regla.
  const addedActorIds = isActorFeed
    ? followedIds
    : followedIds.filter((id) => id !== viewerId);
  // Seguir a nadie ya no vacía el feed: puedes tener clubes igualmente.
  const includePerson = includePeople && followedIds.length > 0;
  if (!includePerson && clubResult.events.length === 0) {
    return { events: [], nextCursor: null, knownUsernames: [] };
  }

  // item_type/item_id ya son columnas propias del pase (§Tarea 9): sin el
  // paso previo por library_entries que resolvía qué entradas eran de un
  // tipo. progress_sessions no tiene item_type propio (cuelga del pase vía
  // pass_id), así que su query se une a diary_entries para filtrar.
  const includeAdded = includePerson && !reviewsOnly && addedActorIds.length > 0;
  const includeProgressed = includePerson && !reviewsOnly;
  const includeDiary = includePerson;
  const includeEpisodes =
    includePerson && (itemTypes === undefined || itemTypes.includes("series"));
  // v1: un pensamiento sobre una saga/persona no tiene item_type, así que no
  // sobrevive a un filtro de pantalla (book/screen), a "reseñas" ni a
  // "clubes" — solo aparece en la vista "todo". El filtrado fino (dejarlo
  // pasar cuando su anchor_type SÍ coincide con book/screen) queda para
  // después de v1 (ver issue abierta).
  const includeThoughts = includePerson && filter === undefined;

  const [addedResult, progressedResult, diaryResult, episodeResult, thoughtResult] = await Promise.all([
    includeAdded
      ? (() => {
          // Cada pase es su propio evento "added" (§Tarea 9, hub): un
          // segundo pase de la misma obra (relectura) tiene su propio
          // created_at y es tan "added" como el primero — igual que ya
          // pasaba con "finished" más abajo, que nunca se filtró por pase
          // activo.
          let q = supabase
            .from("passes")
            .select("id, user_id, item_type, item_id, status, created_at")
            // Sin el visitante: ver `addedActorIds`.
            .in("user_id", addedActorIds)
            // La clave de orden entera, en columnas reales: aquí la fecha y la
            // hora de registro son la MISMA (un alta no se puede backdatear).
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit);
          if (itemTypes) q = q.in("item_type", itemTypes);
          if (cursor) q = q.or(cursorSourceFilter(FEED_SOURCE_COLUMNS.added, cursor));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeProgressed
      ? (() => {
          let q = supabase
            .from("progress_sessions")
            .select(
              // `note` NO se pide: es texto privado del autor (ver el comentario
              // del campo `progress` en FeedEvent). `position` sí, para
              // derivar page/percent (libros).
              "id, user_id, pass_id, session_date, duration_minutes, created_at, position, passes!inner(item_type, item_id)"
            )
            .in("user_id", followedIds)
            .order("session_date", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit);
          if (itemTypes) q = q.in("passes.item_type", itemTypes);
          if (cursor) q = q.or(cursorSourceFilter(FEED_SOURCE_COLUMNS.progressed, cursor));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeDiary
      ? (() => {
          // is_public es SOLO si el texto de la reseña es visible, no si el
          // evento "terminó X" lo es: que alguien acabó un libro no es
          // secreto, así que aquí no se filtra por is_public (Hallazgo 3).
          // review tampoco se selecciona: ya no es una columna legible de
          // diary_entries: el texto (si lo hay y es visible) se resuelve
          // después vía pass_reviews.
          let q = supabase
            .from("passes")
            // updated_at, no created_at: un pase se CREA al añadir la obra a
            // la biblioteca y se termina después con un UPDATE
            // (planTransition → updateActive, passes/transitions.ts), así que
            // created_at no es la hora de registro del terminado — puede ir
            // semanas por delante. `updated_at` lo mantiene el trigger
            // `passes_set_updated_at` y para la transición de cierre ES ese
            // instante. Coste aceptado: una edición posterior (nota, edición)
            // mueve la reseña en el feed.
            .select("id, user_id, item_type, item_id, finished_on, started_on, rating, created_at, updated_at")
            .in("user_id", followedIds)
            // Un pase abierto no es actividad terminada: no aparece en el
            // feed social de gente a la que sigues.
            .not("finished_on", "is", null)
            .order("finished_on", { ascending: false })
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit);
          if (itemTypes) q = q.in("item_type", itemTypes);
          if (cursor) q = q.or(cursorSourceFilter(FEED_SOURCE_COLUMNS.diary, cursor));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeEpisodes
      ? (() => {
          let q = supabase
            .from("episode_watches")
            .select(
              "id, user_id, series_id, season_number, episode_number, rating, review, watched_on, created_at",
            )
            .in("user_id", followedIds)
            .order("watched_on", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit);
          if (reviewsOnly) q = q.not("review", "is", null);
          if (cursor) q = q.or(cursorSourceFilter(FEED_SOURCE_COLUMNS.episodes, cursor));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    includeThoughts
      ? (() => {
          // Espejo de `added`: misma forma timestamptz (orderDate === sortDate
          // === created_at). A diferencia de "added", usa `followedIds` (no
          // `addedActorIds`): tus propios pensamientos SÍ aparecen en tu
          // propio Inicio, igual que tus reseñas/sesiones/episodios.
          let q = supabase
            .from("thoughts")
            .select("id, user_id, anchor_type, anchor_id, body, is_spoiler, created_at")
            .in("user_id", followedIds)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit);
          if (cursor) q = q.or(cursorSourceFilter(FEED_SOURCE_COLUMNS.thoughts, cursor));
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (addedResult.error) throw addedResult.error;
  if (progressedResult.error) throw progressedResult.error;
  if (diaryResult.error) throw diaryResult.error;
  if (episodeResult.error) throw episodeResult.error;
  if (thoughtResult.error) throw thoughtResult.error;

  const addedRows = addedResult.data ?? [];
  const progressedRows = progressedResult.data ?? [];
  const diaryRowsRaw = diaryResult.data ?? [];
  const episodeRows = episodeResult.data ?? [];
  const thoughtRows = thoughtResult.data ?? [];

  // El texto de la reseña vive en pass_reviews (privacidad ya aplicada): una
  // fila que no vuelva aquí es, a efectos del feed, "sin reseña visible" — da
  // igual si es porque no escribió nada o porque la escribió en privado. El
  // evento en sí (arriba) no se filtró por is_public, así que este mapa es la
  // única pieza que decide si se ve el TEXTO.
  const diaryIds = diaryRowsRaw.map((r) => r.id);
  const { data: reviewRows, error: reviewError } = diaryIds.length
    ? await supabase.from("pass_reviews").select("id, review").in("id", diaryIds)
    : { data: [] as { id: string | null; review: string | null }[], error: null };
  if (reviewError) throw reviewError;
  const reviewById = new Map((reviewRows ?? []).map((r) => [r.id, r.review]));

  // Nota pública por sesión (Task 1: política RLS `public notes select` en
  // `notes`). El `.eq("is_public", true)` es cinturón-y-tirantes sobre la
  // RLS: nunca debe salir una fila privada de aquí, ni siquiera en el feed
  // propio del dueño.
  const sessionIds = progressedRows.map((r) => r.id);
  const { data: publicNotes, error: notesError } = sessionIds.length
    ? await supabase
        .from("notes")
        .select("session_id, body, is_spoiler")
        .in("session_id", sessionIds)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
    : { data: [] as { session_id: string | null; body: string | null; is_spoiler: boolean | null }[], error: null };
  if (notesError) throw notesError;
  // Una nota por sesión: la más reciente pública (el order desc + first-wins).
  const noteBySession = new Map<string, { body: string; isSpoiler: boolean }>();
  for (const n of publicNotes ?? []) {
    if (!n.session_id || n.body == null || noteBySession.has(n.session_id)) continue;
    noteBySession.set(n.session_id, { body: n.body, isSpoiler: n.is_spoiler ?? false });
  }

  // "Solo reseñas" ya no puede filtrarse en la query (review no es una
  // columna filtrable desde diary_entries): se aplica aquí, sobre el texto
  // ya resuelto con privacidad.
  const diaryRows = reviewsOnly
    ? diaryRowsRaw.filter((r) => (reviewById.get(r.id) ?? "").trim() !== "")
    : diaryRowsRaw;

  // "Se agotaron todas las fuentes" se mide sobre el fetch bruto de cada
  // query de arriba (antes del merge/corte de más abajo), no sobre cuántas
  // filas de cada fuente sobreviven al corte a pageSize.
  // OJO: `diaryRowsRaw`, no `diaryRows`. Si se mide sobre las filas ya
  // filtradas por "solo reseñas", casi nunca llegan a pageSize (los pases sin
  // texto caen), el feed se da por agotado y la paginación muere en la primera
  // tanda: las reseñas antiguas no se cargarían nunca.
  const allExhausted =
    addedRows.length < fetchLimit &&
    progressedRows.length < fetchLimit &&
    diaryRowsRaw.length < fetchLimit &&
    episodeRows.length < fetchLimit &&
    clubResult.rowCount < fetchLimit &&
    thoughtRows.length < fetchLimit;

  // progress_sessions no tiene item_type propio (cuelga del pase vía
  // pass_id): se resuelve del pase embebido por la query de arriba
  // (passes!inner). Se normaliza array-vs-objeto por si Supabase lo
  // tipa como array — mismo patrón que get-month-calendar.ts.
  type ProgressedRow = (typeof progressedRows)[number];
  function progressedItem(row: ProgressedRow): { itemType: ItemType; itemId: string } | null {
    const embed = row.passes as unknown as
      | { item_type: ItemType; item_id: string }
      | { item_type: ItemType; item_id: string }[]
      | null;
    const entry = Array.isArray(embed) ? embed[0] : embed;
    return entry ? { itemType: entry.item_type, itemId: entry.item_id } : null;
  }

  // Catálogo (título/portada) por tipo, mismo patrón batch que
  // get-library-items.ts.
  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of addedRows) idsByType[r.item_type].add(r.item_id);
  for (const r of progressedRows) {
    const it = progressedItem(r);
    if (it) idsByType[it.itemType].add(it.itemId);
  }
  for (const r of diaryRows) idsByType[r.item_type].add(r.item_id);
  for (const r of episodeRows) idsByType.series.add(r.series_id);
  // Ancla de los pensamientos: book/movie/series entra en el mismo batch de
  // catálogo de arriba; saga/persona son tablas propias, resueltas aparte
  // (ver sagaIds/personIds abajo). El `else` deja `r.anchor_type` acotado a
  // ItemType para TypeScript, una vez descartadas las otras dos ramas.
  const sagaIds = new Set<string>();
  const personIds = new Set<string>();
  for (const r of thoughtRows) {
    if (r.anchor_type === "saga") sagaIds.add(r.anchor_id);
    else if (r.anchor_type === "person") personIds.add(r.anchor_id);
    else idsByType[r.anchor_type].add(r.anchor_id);
  }

  const [books, movies, series, sagas, people] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, title, author, cover_url, total_pages").in("id", [...idsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string; author: string | null; cover_url: string | null; total_pages: number | null }[], error: null }),
    idsByType.movie.size
      ? supabase.from("movies").select("id, title, cover_url").in("id", [...idsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[], error: null }),
    idsByType.series.size
      ? supabase.from("series").select("id, title, cover_url").in("id", [...idsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[], error: null }),
    sagaIds.size
      ? supabase.from("sagas").select("id, name, cover_url").in("id", [...sagaIds])
      : Promise.resolve({ data: [] as { id: string; name: string; cover_url: string | null }[], error: null }),
    personIds.size
      ? supabase.from("people").select("id, name, photo_url").in("id", [...personIds])
      : Promise.resolve({ data: [] as { id: string; name: string; photo_url: string | null }[], error: null }),
  ]);
  if (books.error) throw books.error;
  if (movies.error) throw movies.error;
  if (series.error) throw series.error;
  if (sagas.error) throw sagas.error;
  if (people.error) throw people.error;
  const catalogByKey = new Map<
    string,
    { title: string; coverUrl: string | null; subtitle: string | null; totalPages?: number | null }
  >();
  for (const r of books.data ?? [])
    catalogByKey.set(`book:${r.id}`, {
      title: r.title,
      coverUrl: r.cover_url,
      subtitle: r.author,
      totalPages: r.total_pages,
    });
  for (const r of movies.data ?? [])
    catalogByKey.set(`movie:${r.id}`, { title: r.title, coverUrl: r.cover_url, subtitle: null });
  for (const r of series.data ?? [])
    catalogByKey.set(`series:${r.id}`, { title: r.title, coverUrl: r.cover_url, subtitle: null });
  // sagas/people entran en el MISMO mapa que book/movie/series: comparten
  // forma (title/coverUrl/subtitle) y así `anchorFor` (abajo) no necesita un
  // segundo mapa ni un switch por tipo.
  for (const r of sagas.data ?? [])
    catalogByKey.set(`saga:${r.id}`, { title: r.name, coverUrl: r.cover_url, subtitle: null });
  for (const r of people.data ?? [])
    catalogByKey.set(`person:${r.id}`, { title: r.name, coverUrl: r.photo_url, subtitle: null });

  function anchorFor(type: AnchorType, id: string): AnchorRef | null {
    const meta = catalogByKey.get(`${type}:${id}`);
    if (!meta) return null;
    return { type, id, title: meta.title, imageUrl: meta.coverUrl, subtitle: meta.subtitle };
  }

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
      ...thoughtRows.map((r) => r.user_id),
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

  const events: FeedEventDraft[] = [];

  for (const r of addedRows) {
    const actor = actorById.get(r.user_id);
    const catalog = catalogByKey.get(`${r.item_type}:${r.item_id}`);
    if (!actor || !catalog) continue;
    events.push({
      // "diary_entries_added", no "library_entries" (§Tarea 9, hub): el
      // evento "added" ahora sale del propio pase — ver ShareRef en
      // shared-activity.ts para por qué necesita una etiqueta propia y no
      // puede compartir la de "finished" (`diary_entries:${id}`) aunque sea
      // la MISMA fila.
      id: `diary_entries_added:${r.id}`,
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
      // En esta fuente la fecha semántica, la columna de orden y la hora de
      // registro son la misma columna: un alta no se puede backdatear.
      orderDate: r.created_at,
      sortDate: r.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: null,
      reviewMeta: null,
      thought: null,
      interactionTarget: { targetType: "pass", targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
      reactions: emptyReactions(),
    });
  }

  for (const r of progressedRows) {
    const actor = actorById.get(r.user_id);
    const it = progressedItem(r);
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
      eventDate: sessionRelativeBasis(r.session_date, r.created_at),
      // El orden va por la columna EN CRUDO, sin la sustitución de arriba: es
      // lo que la query puede filtrar y ordenar.
      orderDate: r.session_date,
      // Hora real de registro: desempata sesiones backdateadas del mismo día
      // (ver comentario del campo en FeedEvent).
      sortDate: r.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: (() => {
        const pos = (r.position ?? {}) as { page?: number };
        const page = typeof pos.page === "number" ? pos.page : null;
        const total = catalog.totalPages ?? null;
        const percent = page != null && total ? Math.min(100, Math.round((page / total) * 100)) : null;
        return {
          durationMinutes: r.duration_minutes,
          page,
          percent,
          note: noteBySession.get(r.id) ?? null,
        };
      })(),
      reviewMeta: null,
      thought: null,
      interactionTarget: { targetType: "progress_session", targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
      reactions: emptyReactions(),
    });
  }

  for (const r of diaryRows) {
    const actor = actorById.get(r.user_id);
    const catalog = catalogByKey.get(`${r.item_type}:${r.item_id}`);
    if (!actor || !catalog) continue;
    // El filtro .not("finished_on", "is", null) de la query ya garantiza
    // esto en runtime; la comprobación es solo para que el compilador vea
    // el tipo correcto (Supabase no lo infiere de la query).
    if (r.finished_on === null) continue;
    // undefined (no vino de pass_reviews) y null (vino pero sin texto) se
    // tratan igual: sin reseña visible. Reviews privadas de otros caen aquí.
    const reviewText = reviewById.get(r.id) ?? null;
    events.push({
      id: `diary_entries:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(r.rating, reviewText, "finished"),
      itemType: r.item_type,
      itemId: r.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      itemSubtitle: catalog.subtitle,
      entryStatus: null,
      // finished_on es una columna `date`: sin hora, timeAgo la interpreta como
      // medianoche UTC y en Madrid arranca con 2 horas de desfase. Mismo criterio
      // que las sesiones: si es de hoy, la hora de registro es precisa y se usa;
      // si está backdateada, no hay hora real que mostrar.
      //
      // La hora de registro aquí es `updated_at`, NO `created_at`: a diferencia
      // de progress_sessions / episode_watches —que insertan una fila por
      // evento—, el pase se crea al AÑADIR la obra y el terminado llega después
      // como UPDATE. Con created_at el «hace x» mediría desde el alta, y el
      // segundo componente de la clave de orden dejaría de ser la hora en que
      // el terminado se registró (ver feed-cursor-bounds.test.ts).
      eventDate: sessionRelativeBasis(r.finished_on, r.updated_at),
      orderDate: r.finished_on,
      sortDate: r.updated_at,
      rating: r.rating,
      reviewExcerpt: excerpt(reviewText),
      episode: null,
      progress: null,
      reviewMeta: {
        readingDays:
          r.item_type === "book" && r.started_on && r.finished_on
            ? Math.max(1, Math.round((Date.parse(r.finished_on) - Date.parse(r.started_on)) / 86_400_000) + 1)
            : null,
        totalPages: catalogByKey.get(`${r.item_type}:${r.item_id}`)?.totalPages ?? null,
      },
      thought: null,
      interactionTarget: { targetType: "diary_entry", targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
      reactions: emptyReactions(),
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
      // watched_on también es `date`: mismo criterio que finished_on y que las
      // sesiones (ver el bucle de reseñas).
      eventDate: sessionRelativeBasis(r.watched_on, r.created_at),
      orderDate: r.watched_on,
      sortDate: r.created_at,
      rating: r.rating,
      reviewExcerpt: excerpt(r.review),
      episode: {
        season: r.season_number,
        episode: r.episode_number,
        title:
          titleByEpisode.get(`${r.series_id}:${r.season_number}:${r.episode_number}`) ?? null,
      },
      progress: null,
      reviewMeta: null,
      thought: null,
      interactionTarget: { targetType: "episode_watch", targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
      reactions: emptyReactions(),
    });
  }

  for (const r of thoughtRows) {
    const actor = actorById.get(r.user_id);
    if (!actor) continue;
    // Ancla borrada (libro/saga/persona eliminados) ⇒ se descarta el evento,
    // igual que un "added"/"diary" sin fila de catálogo (`if (!catalog)
    // continue` arriba).
    const anchor = anchorFor(r.anchor_type, r.anchor_id);
    if (!anchor) continue;
    events.push({
      id: `thoughts:${r.id}`,
      actorId: r.user_id,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "thought",
      // Ver el comentario de itemType/itemId en FeedEvent (feed.ts arriba):
      // valor real solo cuando el ancla es de catálogo; saga/persona no caben
      // en ItemType y caen a un placeholder INERTE Y POTENCIALMENTE FALSO
      // (itemType:"book" con itemId = uuid de saga/persona) — el despacho del
      // feed (feed-item.tsx) enruta verb:"thought" a su propia tarjeta antes
      // de que nada lea este par.
      itemType: anchor.type === "saga" || anchor.type === "person" ? "book" : anchor.type,
      itemId: anchor.id,
      itemTitle: anchor.title,
      itemCoverUrl: anchor.imageUrl,
      itemSubtitle: anchor.subtitle,
      entryStatus: null,
      // Sin sustitución de sessionRelativeBasis: created_at ya es un
      // timestamp real (mismo criterio que "added"/"clubs").
      eventDate: r.created_at,
      orderDate: r.created_at,
      sortDate: r.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: null,
      reviewMeta: null,
      thought: { body: r.body, isSpoiler: r.is_spoiler, anchor },
      interactionTarget: { targetType: "thought", targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
      reactions: emptyReactions(),
    });
  }

  // Las dos familias se mezclan aquí, ya como entradas: a partir de este punto
  // el orden, el cursor y el corte son los mismos para ambas.
  // Espeja a `FeedEntry` salvo en el evento de persona, que aquí sigue siendo
  // el borrador (interactionTargetId aún sin resolver). `orderDate` y `sortDate`
  // son obligatorios en las dos ramas: son los dos primeros componentes de la
  // clave de orden (`OrderableEntry`, feed-order.ts) y sin ellos ni
  // `compareEntries` ni `isAfterCursor` ni `makeCursor` aceptan estas entradas.
  const entries: Array<
    | { source: "person"; id: string; eventDate: string; orderDate: string; sortDate: string; event: FeedEventDraft }
    | { source: "club"; id: string; eventDate: string; orderDate: string; sortDate: string; event: ClubFeedEvent }
  > = [
    ...events.map(
      (event) => ({
        source: "person",
        id: event.id,
        eventDate: event.eventDate,
        orderDate: event.orderDate,
        sortDate: event.sortDate,
        event,
      }) as const,
    ),
    ...clubResult.events.map(
      (event) => ({
        source: "club",
        id: event.id,
        eventDate: event.eventDate,
        // El evento de club ya ES su created_at (club-feed.ts), así que su
        // columna de orden, su hora real de registro y su fecha semántica
        // coinciden.
        orderDate: event.eventDate,
        sortDate: event.eventDate,
        event,
      }) as const,
    ),
  ];

  // Orden total (día de la columna de fecha desc, hora de registro desc, id
  // desc) — ver feed-order.ts. El comparador y `isAfterCursor` son una sola
  // invariante: si dejan de coincidir, la paginación pierde o repite filas.
  entries.sort(compareEntries);
  // Los filtros de query son inclusivos en el borde, así que aquí se descarta lo
  // ya servido en páginas anteriores — incluido el propio evento del cursor.
  const fresh = cursor ? entries.filter((e) => isAfterCursor(e, cursor)) : entries;
  // El corte NO es un simple slice(pageSize): la agrupación de presentación
  // colapsa filas en tarjetas y esas tarjetas SE SOLAPAN en el orden (un
  // timeline de avances contiene eventos sueltos de otros dentro de su lapso).
  // Cortar por fila cruda partiría tarjetas entre páginas (#295/#303) o perdería
  // las filas que viven dentro del lapso de un grupo. `planFeedPageCut` corta en
  // un BORDE que ningún grupo cruza: el cursor sigue siendo el keyset crudo de la
  // última fila servida (`makeCursor(last)` abajo, formato y filtro SQL intactos)
  // y la siguiente tanda continúa sin duplicar ni perder. Ver feed-paging.ts.
  //
  // ponytail: residuo acotado (#391) — un import masivo del MISMO instante que
  // exceda `fetchLimit` sin hueco interno puede quedar como dos tarjetas
  // "añadió N" entre páginas y con el conteo de lo traído, no el total. Decidido
  // "acotar sin count": una query de count exacta queda como refinamiento.
  //
  // `openTailIds`: por cada fuente que tocó su límite de fetch (pudo dejar filas
  // sin traer), el id del evento más VIEJO suyo que sigue en `fresh`. Una tarjeta
  // que lo contenga podría tener más miembros más allá del fetch — el
  // planificador la retiene para no partirla. `fresh` está ordenado desc, así que
  // el más viejo de cada fuente es el último que aparece.
  const sourceLimitHit: Array<[string, boolean]> = [
    [FEED_SOURCE_COLUMNS.added.eventIdPrefix, addedRows.length >= fetchLimit],
    [FEED_SOURCE_COLUMNS.progressed.eventIdPrefix, progressedRows.length >= fetchLimit],
    [FEED_SOURCE_COLUMNS.diary.eventIdPrefix, diaryRowsRaw.length >= fetchLimit],
    [FEED_SOURCE_COLUMNS.episodes.eventIdPrefix, episodeRows.length >= fetchLimit],
    [FEED_SOURCE_COLUMNS.clubs.eventIdPrefix, clubResult.rowCount >= fetchLimit],
    [FEED_SOURCE_COLUMNS.thoughts.eventIdPrefix, thoughtRows.length >= fetchLimit],
  ];
  const openTailIds = new Set<string>();
  for (const [prefix, limitHit] of sourceLimitHit) {
    if (!limitHit) continue;
    for (let i = fresh.length - 1; i >= 0; i--) {
      if (fresh[i].id.startsWith(prefix)) {
        openTailIds.add(fresh[i].id);
        break;
      }
    }
  }
  const cut = planFeedPageCut(
    fresh,
    (e) => (e.source === "person" ? descriptorForEvent(e.event) : null),
    pageSize,
    openTailIds,
  );
  const page = fresh.slice(0, cut);

  const addedPageEvents = page.flatMap((entry) =>
    entry.source === "person" && entry.event.verb === "added"
      ? [entry.event]
      : [],
  );
  const addedItemIds = [
    ...new Set(addedPageEvents.map((event) => event.itemId)),
  ];
  const { data: viewerPasses, error: viewerPassesError } =
    viewerId && addedItemIds.length > 0
      ? await supabase
          .from("passes")
          .select("item_type, item_id")
          .eq("user_id", viewerId)
          .eq("is_active", true)
          .in("item_id", addedItemIds)
      : {
          data: [] as { item_type: ItemType; item_id: string }[],
          error: null,
        };
  if (viewerPassesError) throw viewerPassesError;

  const viewerPassKeys = new Set(
    (viewerPasses ?? []).map((pass) => `${pass.item_type}:${pass.item_id}`),
  );
  for (const event of addedPageEvents) {
    event.viewerHasActivePass = viewerPassKeys.has(
      `${event.itemType}:${event.itemId}`,
    );
  }

  // viewerCanDelete (task-delete, #525): dueño o admin global. Un solo batch
  // por página, mismo patrón que viewerHasActivePass arriba -- nunca un RPC
  // por tarjeta. `moderatable_target_ids` toma los ids FUENTE (thoughts.id,
  // vía interactionTarget.targetId con targetType:"thought"), no el uuid del
  // target canónico. Sin viewer o sin thoughts en la página, no hace falta el
  // roundtrip: el campo queda undefined (falsy) para todos esos eventos.
  const thoughtPageEvents = page.flatMap((entry) =>
    entry.source === "person" && entry.event.verb === "thought" ? [entry.event] : [],
  );
  if (viewerId && thoughtPageEvents.length > 0) {
    const thoughtSourceIds = [
      ...new Set(
        thoughtPageEvents
          .map((event) => event.interactionTarget?.targetId)
          .filter((id): id is string => id !== undefined),
      ),
    ];
    const { data: moderatableThoughtIds, error: moderatableThoughtIdsError } =
      await supabase.rpc("moderatable_target_ids", {
        candidate_target_type: "thought",
        candidate_target_ids: thoughtSourceIds,
      });
    if (moderatableThoughtIdsError) throw moderatableThoughtIdsError;
    const moderatableThoughtIdSet = new Set((moderatableThoughtIds ?? []) as string[]);
    for (const event of thoughtPageEvents) {
      const sourceId = event.interactionTarget?.targetId;
      event.viewerCanDelete =
        event.actorId === viewerId ||
        (sourceId !== undefined && moderatableThoughtIdSet.has(sourceId));
    }
  }

  // Interacciones de Bloque B, batch por tipo, solo para los eventos de esta
  // página que tienen target real. Las actividades de club no son un target de
  // interacción, así que aquí solo entran los de persona.
  const personEvents = page.filter((e) => e.source === "person").map((e) => e.event);
  const diaryTargetIds = personEvents
    .filter((e) => e.interactionTarget?.targetType === "diary_entry")
    .map((e) => e.interactionTarget!.targetId);
  const episodeTargetIds = personEvents
    .filter((e) => e.interactionTarget?.targetType === "episode_watch")
    .map((e) => e.interactionTarget!.targetId);
  const passTargetIds = personEvents
    .filter((e) => e.interactionTarget?.targetType === "pass")
    .map((e) => e.interactionTarget!.targetId);
  const sessionTargetIds = personEvents
    .filter((e) => e.interactionTarget?.targetType === "progress_session")
    .map((e) => e.interactionTarget!.targetId);
  const thoughtTargetIds = personEvents
    .filter((e) => e.interactionTarget?.targetType === "thought")
    .map((e) => e.interactionTarget!.targetId);
  const [diarySummaries, episodeSummaries, passSummaries, sessionSummaries, thoughtSummaries] =
    await Promise.all([
      getInteractionSummary(supabase, "diary_entry", diaryTargetIds),
      getInteractionSummary(supabase, "episode_watch", episodeTargetIds),
      getInteractionSummary(supabase, "pass", passTargetIds),
      getInteractionSummary(supabase, "progress_session", sessionTargetIds),
      getInteractionSummary(supabase, "thought", thoughtTargetIds),
    ]);
  for (const e of personEvents) {
    if (!e.interactionTarget) continue;
    const summaries =
      e.interactionTarget.targetType === "diary_entry" ? diarySummaries
      : e.interactionTarget.targetType === "episode_watch" ? episodeSummaries
      : e.interactionTarget.targetType === "pass" ? passSummaries
      : e.interactionTarget.targetType === "thought" ? thoughtSummaries
      : sessionSummaries;
    const s = summaries.get(e.interactionTarget.targetId);
    if (!s) {
      throw new Error(
        `Interaction summary missing for ${e.interactionTarget.targetType}:${e.interactionTarget.targetId}`,
      );
    }
    e.interactionTarget.interactionTargetId = s.interactionTargetId;
    e.reactionCount = s.reactionCount;
    e.viewerReacted = s.viewerReacted;
    e.commentCount = s.commentCount;
    e.comments = s.comments;
    e.reactions = s.reactions;
  }

  const finalizedPage: FeedEntry[] = page.map((entry) => {
    if (entry.source === "club") return entry;
    const target = entry.event.interactionTarget;
    if (!target) {
      return { ...entry, event: { ...entry.event, interactionTarget: null } };
    }
    const { interactionTargetId } = target;
    if (interactionTargetId === null) {
      throw new Error(`Interaction target unresolved for ${target.targetType}:${target.targetId}`);
    }
    const event: FeedEvent = {
      ...entry.event,
      interactionTarget: { ...target, interactionTargetId },
    };
    return { ...entry, event };
  });

  // El feed se agota SOLO cuando se sirvió hasta el final del fetch (`cut` llegó
  // al final de `fresh`) Y ninguna fuente tenía más. `planFeedPageCut` puede
  // cortar ANTES del final aunque las fuentes estén agotadas (corta en un borde
  // limpio tras `pageSize` tarjetas): en ese caso quedan filas en `fresh` y hay
  // que seguir, o se pierden (era el bug de perder filas al meter el corte por
  // tarjetas).
  const last = page[page.length - 1];
  const servedAll = cut >= fresh.length;
  const nextCursor = (allExhausted && servedAll) || !last ? null : makeCursor(last);

  const knownUsernames = await resolveKnownMentions(supabase, [
    ...personEvents.map((e) => e.reviewExcerpt).filter((t): t is string => t !== null),
    ...personEvents.map((e) => e.thought?.body).filter((t): t is string => t !== undefined),
    ...personEvents.flatMap((e) => e.comments.map((c) => c.body)),
  ]);

  // La agrupación es solo de presentación y se aplica DESPUÉS de fijar el
  // cursor: nextCursor apunta a un evento real de `page`, no a un grupo
  // sintético. Un grupo partido en el borde de página reaparece como grupo
  // propio en la siguiente tanda (limitación conocida → issue).
  return { events: groupPersonEntries(finalizedPage), nextCursor, knownUsernames };
}
