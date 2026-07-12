import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { FeedEvent, FeedVerb } from "./feed";

// Resuelve UNA fila concreta (no un fan-out por seguidos) a la misma forma
// FeedEvent que usa el feed personal (Bloque C, SD-1) -- usado por
// activity_share (Bloque F) para re-derivar en cada lectura lo que se
// compartió a un club, en vez de guardar un snapshot congelado. ShareRef usa
// el mismo vocabulario que FeedEvent.id (`${sourceTable}:${rowId}`) para no
// inventar una nomenclatura paralela -- el picker de compartir simplemente
// hace `feedEvent.id.split(":")`.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ShareRef = {
  sourceTable: "library_entries" | "progress_sessions" | "diary_entries" | "episode_watches";
  rowId: string;
};

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
  const table = itemType === "book" ? "books" : itemType === "movie" ? "movies" : "series";
  const { data } = await supabase.from(table).select("title, cover_url").eq("id", itemId).maybeSingle();
  return data;
}

async function resolveLibraryEntryItem(supabase: SupabaseServerClient, libraryEntryId: string) {
  const { data } = await supabase
    .from("library_entries")
    .select("item_type, item_id")
    .eq("id", libraryEntryId)
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
): Promise<FeedEvent | null> {
  if (ref.sourceTable === "library_entries") {
    const { data: row } = await supabase
      .from("library_entries")
      .select("id, user_id, item_type, item_id, created_at")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, row.item_type as ItemType, row.item_id),
    ]);
    if (!actor || !catalog) return null;
    return {
      id: `library_entries:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "added",
      itemType: row.item_type as ItemType,
      itemId: row.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      eventDate: row.created_at,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: null,
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  }

  if (ref.sourceTable === "progress_sessions") {
    const { data: row } = await supabase
      .from("progress_sessions")
      .select("id, user_id, library_entry_id, session_date, duration_minutes, note")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const item = await resolveLibraryEntryItem(supabase, row.library_entry_id);
    if (!item) return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, item.itemType, item.itemId),
    ]);
    if (!actor || !catalog) return null;
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
      eventDate: row.session_date,
      rating: null,
      reviewExcerpt: null,
      episode: null,
      progress: { durationMinutes: row.duration_minutes, note: row.note },
      interactionTarget: null,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  }

  if (ref.sourceTable === "diary_entries") {
    const { data: row } = await supabase
      .from("diary_entries")
      .select("id, user_id, library_entry_id, finished_on, rating, review")
      .eq("id", ref.rowId)
      .maybeSingle();
    if (!row) return null;
    const item = await resolveLibraryEntryItem(supabase, row.library_entry_id);
    if (!item) return null;
    const [actor, catalog] = await Promise.all([
      resolveActor(supabase, row.user_id),
      resolveCatalog(supabase, item.itemType, item.itemId),
    ]);
    if (!actor || !catalog) return null;
    return {
      id: `diary_entries:${row.id}`,
      actorId: row.user_id,
      actorUsername: actor.username!,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: verbForReviewable(row.rating, row.review, "finished"),
      itemType: item.itemType,
      itemId: item.itemId,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.cover_url,
      eventDate: row.finished_on,
      rating: row.rating,
      reviewExcerpt: excerpt(row.review),
      episode: null,
      progress: null,
      interactionTarget: { targetType: "diary_entry", targetId: row.id },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  }

  // episode_watches
  const { data: row } = await supabase
    .from("episode_watches")
    .select("id, user_id, series_id, season_number, episode_number, rating, review, watched_on")
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
    eventDate: row.watched_on,
    rating: row.rating,
    reviewExcerpt: excerpt(row.review),
    episode: { season: row.season_number, episode: row.episode_number, title: episodeTitle },
    progress: null,
    interactionTarget: { targetType: "episode_watch", targetId: row.id },
    reactionCount: 0,
    viewerReacted: false,
    commentCount: 0,
    comments: [],
  };
}
