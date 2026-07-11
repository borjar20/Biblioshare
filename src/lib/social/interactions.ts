import type { createClient } from "@/lib/supabase/server";

// Capa de lectura de interacciones (EPIC-05, Bloque B, SD-3). Batch-fetch de
// reacciones/comentarios para un conjunto de targets del mismo tipo — cada
// call site solo trabaja con un tipo a la vez (get-community.ts con
// diary_entry, get-episode-reviews.ts con episode_watch), así que no hace
// falta mezclar tipos en una misma llamada. Las mutaciones viven en
// src/lib/social/interaction-actions.ts ("use server").

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TargetType = "diary_entry" | "episode_watch";

export type InteractionComment = {
  id: string;
  authorId: string;
  author: string;
  initials: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
};

export type InteractionSummary = {
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

// Hilo esperado corto (Reddit-lite, Q del diseño); sin paginación en este MVP.
const COMMENT_PREFETCH_LIMIT = 20;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

async function resolveAuthorNames(
  supabase: SupabaseServerClient,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name")
    .in("user_id", userIds);
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter(
        (p): p is typeof p & { user_id: string } => p.user_id != null,
      )
      .map((p) => [p.user_id, p.display_name || p.username || "—"]),
  );
}

export async function getInteractionSummary(
  supabase: SupabaseServerClient,
  targetType: TargetType,
  targetIds: string[],
): Promise<Map<string, InteractionSummary>> {
  const summaries = new Map<string, InteractionSummary>();
  if (targetIds.length === 0) return summaries;

  for (const id of targetIds) {
    summaries.set(id, {
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [reactionsResult, commentsResult] = await Promise.all([
    supabase
      .from("reactions")
      .select("target_id, user_id")
      .eq("target_type", targetType)
      .in("target_id", targetIds),
    supabase
      .from("comments")
      .select("id, target_id, author_id, body, created_at")
      .eq("target_type", targetType)
      .in("target_id", targetIds)
      .order("created_at", { ascending: true }),
  ]);

  if (reactionsResult.error) throw reactionsResult.error;
  if (commentsResult.error) throw commentsResult.error;

  for (const r of reactionsResult.data ?? []) {
    const s = summaries.get(r.target_id);
    if (!s) continue;
    s.reactionCount += 1;
    if (user && r.user_id === user.id) s.viewerReacted = true;
  }

  const commentRows = commentsResult.data ?? [];
  const authorIds = [...new Set(commentRows.map((c) => c.author_id))];
  const nameByAuthor = await resolveAuthorNames(supabase, authorIds);

  const seenPerTarget = new Map<string, number>();
  for (const c of commentRows) {
    const s = summaries.get(c.target_id);
    if (!s) continue;
    s.commentCount += 1;
    const seen = (seenPerTarget.get(c.target_id) ?? 0) + 1;
    seenPerTarget.set(c.target_id, seen);
    if (seen > COMMENT_PREFETCH_LIMIT) continue;
    const author = nameByAuthor.get(c.author_id) ?? "—";
    s.comments.push({
      id: c.id,
      authorId: c.author_id,
      author,
      initials: initials(author) || "?",
      body: c.body,
      createdAt: c.created_at,
      isOwn: user?.id === c.author_id,
    });
  }

  return summaries;
}
