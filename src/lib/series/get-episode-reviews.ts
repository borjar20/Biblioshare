import type { createClient } from "@/lib/supabase/server";
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Reseña de un episodio, análoga a CommunityReview pero etiquetada con SxEy.
export type EpisodeReview = {
  id: string;
  interactionTargetId: string;
  author: string;
  initials: string;
  /** Username del autor para enlazar a /u/:username. null = perfil sin username. */
  username: string | null;
  /** Avatar del autor (Storage o URL legado); null = iniciales. */
  avatarUrl: string | null;
  season: number;
  episode: number;
  episodeTitle: string | null;
  watchedOn: string; // ISO date
  rating: number | null; // 1–10
  text: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

export type EpisodeReviewsResult = {
  reviews: EpisodeReview[];
  // Usernames @mencionados en `reviews` (texto + comentarios) que existen de
  // verdad — mismo patrón que Community.knownUsernames en get-community.ts.
  knownUsernames: string[];
};

const MAX_REVIEWS = 20;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Reseñas por episodio de una serie: filas de episode_watches con texto de
// reseña, de cualquier perfil visible (RLS resuelve la visibilidad, igual que
// getCommunity en src/lib/community/get-community.ts). Ver §7.x.
export async function getEpisodeReviews(
  supabase: SupabaseServerClient,
  seriesId: string
): Promise<EpisodeReviewsResult> {
  const { data: rows } = await supabase
    .from("episode_watches")
    .select("id, user_id, season_number, episode_number, rating, review, watched_on")
    .eq("series_id", seriesId)
    .not("review", "is", null)
    .order("watched_on", { ascending: false })
    .limit(MAX_REVIEWS);

  const withText = (rows ?? []).filter((r) => (r.review ?? "").trim() !== "");
  if (withText.length === 0) return { reviews: [], knownUsernames: [] };

  const userIds = [...new Set(withText.map((r) => r.user_id))];
  const [{ data: profiles }, { data: episodes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .in("user_id", userIds),
    supabase
      .from("series_episodes")
      .select("season_number, episode_number, title")
      .eq("series_id", seriesId),
  ]);

  const identityByUser = new Map(
    (profiles ?? []).map((p) => [
      p.user_id,
      { name: p.display_name || p.username, username: p.username, avatarUrl: p.avatar_url },
    ])
  );
  const titleByEp = new Map(
    (episodes ?? []).map((e) => [`${e.season_number}:${e.episode_number}`, e.title])
  );

  const reviewBases = withText.map((r) => {
    const identity = identityByUser.get(r.user_id);
    const author = identity?.name ?? "—";
    return {
      id: r.id,
      author,
      initials: initials(author) || "?",
      username: identity?.username ?? null,
      avatarUrl: identity?.avatarUrl ?? null,
      season: r.season_number,
      episode: r.episode_number,
      episodeTitle: titleByEp.get(`${r.season_number}:${r.episode_number}`) ?? null,
      watchedOn: r.watched_on,
      rating: r.rating,
      text: (r.review ?? "").trim(),
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    };
  });

  const summaries = await getInteractionSummary(
    supabase,
    "episode_watch",
    reviewBases.map((r) => r.id),
  );
  const resolved: EpisodeReview[] = reviewBases.map((review) => {
    const summary = summaries.get(review.id);
    if (!summary) throw new Error(`Interaction summary missing for episode_watch:${review.id}`);
    return { ...review, ...summary };
  });

  const knownUsernames = await resolveKnownMentions(supabase, [
    ...resolved.map((r) => r.text),
    ...resolved.flatMap((r) => r.comments.map((c) => c.body)),
  ]);

  return { reviews: resolved, knownUsernames };
}
