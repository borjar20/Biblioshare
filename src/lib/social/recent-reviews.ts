import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { FeedEvent } from "./feed";
import { getInteractionSummary } from "./interactions";

// Reseñas recientes de UN usuario para su pestaña Actividad (mockup "IA
// nueva", frame D). A diferencia de getFeed (fan-out por seguidos), aquí se
// consulta directamente por autor sobre las dos fuentes con reseña. Solo
// lectura: la RLS existente (can_view_profile) decide qué ve el visitante.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RecentReviewDraft = Omit<FeedEvent, "interactionTarget"> & {
  interactionTarget: {
    targetType: "diary_entry" | "episode_watch";
    targetId: string;
    interactionTargetId: string | null;
  };
};

const REVIEW_EXCERPT_LENGTH = 200;

function excerpt(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= REVIEW_EXCERPT_LENGTH) return trimmed;
  return trimmed.slice(0, REVIEW_EXCERPT_LENGTH).trimEnd() + "…";
}

export async function getRecentReviews(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 3,
): Promise<FeedEvent[]> {
  const [diaryResult, episodeResult, actorResult] = await Promise.all([
    // review ya no es una columna legible de diary_entries: se lee de la
    // vista pass_reviews (privacidad ya aplicada — ver
    // 20260714_passes_review_privacy.sql). El .eq("is_public", true) de abajo
    // se deja como defensa en profundidad y para dejar la intención
    // explícita: esta función alimenta la pestaña Actividad del perfil
    // PÚBLICO (la ve cualquier visitante), así que las reseñas privadas
    // (incluso las propias, si el dueño mira su propio perfil) no deben
    // aparecer aquí.
    supabase
      .from("pass_reviews")
      .select("id, user_id, item_type, item_id, finished_on, rating, review")
      .eq("user_id", userId)
      .not("review", "is", null)
      // Un pase abierto no es una reseña: todavía no ha terminado.
      .not("finished_on", "is", null)
      .eq("is_public", true)
      .order("finished_on", { ascending: false })
      .limit(limit),
    supabase
      .from("episode_watches")
      .select(
        "id, user_id, series_id, season_number, episode_number, rating, review, watched_on",
      )
      .eq("user_id", userId)
      .not("review", "is", null)
      .order("watched_on", { ascending: false })
      .limit(limit),
    supabase
      .from("profile_identities")
      .select("user_id, username, display_name, avatar_url")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (diaryResult.error) throw diaryResult.error;
  if (episodeResult.error) throw episodeResult.error;
  if (actorResult.error) throw actorResult.error;

  const actor = actorResult.data;
  if (!actor?.username) return [];

  // El filtro anterior garantiza finished_on no nulo; se narrowa aquí porque
  // Supabase no infiere el tipo a partir de la query. pass_reviews tipa TODAS
  // sus columnas como nullable (es una vista), así que también se narrowan
  // id/item_type/item_id — nunca vienen null en la práctica.
  const diaryRows = (diaryResult.data ?? []).filter(
    (r): r is typeof r & { id: string; item_type: ItemType; item_id: string; finished_on: string } =>
      r.id !== null && r.item_type !== null && r.item_id !== null && r.finished_on !== null
  );
  const episodeRows = episodeResult.data ?? [];

  // Catálogo por tipo, mismo patrón batch que feed.ts (books trae author).
  // item_type/item_id ya son columnas propias del pase (§Tarea 9): sin join
  // a library_entries.
  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of diaryRows) idsByType[r.item_type].add(r.item_id);
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

  // Título de episodio, best-effort (igual que feed.ts).
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

  const events: RecentReviewDraft[] = [];

  for (const r of diaryRows) {
    const catalog = catalogByKey.get(`${r.item_type}:${r.item_id}`);
    if (!catalog) continue;
    events.push({
      id: `diary_entries:${r.id}`,
      actorId: userId,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "reviewed",
      itemType: r.item_type,
      itemId: r.item_id,
      itemTitle: catalog.title,
      itemCoverUrl: catalog.coverUrl,
      itemSubtitle: catalog.subtitle,
      entryStatus: null,
      eventDate: r.finished_on,
      rating: r.rating,
      reviewExcerpt: excerpt(r.review),
      episode: null,
      progress: null,
      reviewMeta: null,
      interactionTarget: { targetType: "diary_entry", targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  for (const r of episodeRows) {
    const catalog = catalogByKey.get(`series:${r.series_id}`);
    if (!catalog) continue;
    events.push({
      id: `episode_watches:${r.id}`,
      actorId: userId,
      actorUsername: actor.username,
      actorDisplayName: actor.display_name,
      actorAvatarUrl: actor.avatar_url,
      verb: "reviewed",
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
      reviewMeta: null,
      interactionTarget: { targetType: "episode_watch", targetId: r.id, interactionTargetId: null },
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  events.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0));
  const page = events.slice(0, limit);

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
  }

  return page.map((event): FeedEvent => {
    const interactionTargetId = event.interactionTarget.interactionTargetId;
    if (interactionTargetId === null) {
      throw new Error(
        `Interaction target unresolved for ${event.interactionTarget.targetType}:${event.interactionTarget.targetId}`,
      );
    }
    return {
      ...event,
      interactionTarget: { ...event.interactionTarget, interactionTargetId },
    };
  });
}
