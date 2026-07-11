import type { createClient } from "@/lib/supabase/server";
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Reseña de un episodio, análoga a CommunityReview pero etiquetada con SxEy.
export type EpisodeReview = {
  id: string;
  author: string;
  initials: string;
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
): Promise<EpisodeReview[]> {
  const { data: rows } = await supabase
    .from("episode_watches")
    .select("id, user_id, season_number, episode_number, rating, review, watched_on")
    .eq("series_id", seriesId)
    .not("review", "is", null)
    .order("watched_on", { ascending: false })
    .limit(MAX_REVIEWS);

  const withText = (rows ?? []).filter((r) => (r.review ?? "").trim() !== "");
  if (withText.length === 0) return [];

  const userIds = [...new Set(withText.map((r) => r.user_id))];
  const [{ data: profiles }, { data: episodes }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, username, display_name")
      .in("user_id", userIds),
    supabase
      .from("series_episodes")
      .select("season_number, episode_number, title")
      .eq("series_id", seriesId),
  ]);

  const nameByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.display_name || p.username])
  );
  const titleByEp = new Map(
    (episodes ?? []).map((e) => [`${e.season_number}:${e.episode_number}`, e.title])
  );

  const reviews = withText.map((r) => {
    const author = nameByUser.get(r.user_id) ?? "—";
    return {
      id: r.id,
      author,
      initials: initials(author) || "?",
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
    reviews.map((r) => r.id),
  );
  return reviews.map((r) => ({ ...r, ...summaries.get(r.id) }));
}
