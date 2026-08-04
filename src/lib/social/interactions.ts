import type { createClient } from "@/lib/supabase/server";
import {
  getInteractionTargetRefs,
  type TargetType as CanonicalTargetType,
} from "./interaction-targets";

// Capa de lectura de interacciones (EPIC-05, Bloque B, SD-3). Batch-fetch de
// reacciones/comentarios para un conjunto de targets del mismo tipo — cada
// call site solo trabaja con un tipo a la vez (get-community.ts con
// diary_entry, get-episode-reviews.ts con episode_watch), así que no hace
// falta mezclar tipos en una misma llamada. Las mutaciones viven en
// src/lib/social/interaction-actions.ts ("use server").

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TargetType = Exclude<CanonicalTargetType, "comment">;
export type ReactableTargetType = CanonicalTargetType;

export type InteractionComment = {
  id: string;
  interactionTargetId: string;
  authorId: string;
  author: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  initials: string;
  body: string;
  createdAt: string;
  isOwn: boolean;
  canDelete: boolean;
  reactionCount: number;
  viewerReacted: boolean;
};

export type InteractionSummary = {
  interactionTargetId: string;
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
): Promise<
  Map<string, { name: string; username: string | null; avatarUrl: string | null }>
> {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", userIds);
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter(
        (p): p is typeof p & { user_id: string } => p.user_id != null,
      )
      .map((p) => [
        p.user_id,
        {
          name: p.display_name || p.username || "—",
          username: p.username ?? null,
          avatarUrl: p.avatar_url ?? null,
        },
      ]),
  );
}

export async function getInteractionSummary(
  supabase: SupabaseServerClient,
  targetType: TargetType,
  targetIds: string[],
): Promise<Map<string, InteractionSummary>> {
  const summaries = new Map<string, InteractionSummary>();
  if (targetIds.length === 0) return summaries;

  const targetRefs = await getInteractionTargetRefs(
    supabase,
    targetIds.map((sourceId) => ({ kind: targetType, sourceId })),
  );
  const sourceIdByTargetId = new Map<string, string>();
  const interactionTargetIds: string[] = [];
  for (const sourceId of targetIds) {
    const targetRef = targetRefs.get(`${targetType}:${sourceId}`);
    if (!targetRef) {
      throw new Error(`Interaction target missing for ${targetType}:${sourceId}`);
    }
    summaries.set(sourceId, {
      interactionTargetId: targetRef.id,
      reactionCount: 0,
      viewerReacted: false,
      commentCount: 0,
      comments: [],
    });
    sourceIdByTargetId.set(targetRef.id, sourceId);
    interactionTargetIds.push(targetRef.id);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [reactionsResult, commentsResult] = await Promise.all([
    supabase
      .from("reactions")
      .select("interaction_target_id, user_id")
      .in("interaction_target_id", interactionTargetIds),
    supabase
      .from("comments")
      .select("id, interaction_target_id, author_id, body, created_at")
      .in("interaction_target_id", interactionTargetIds)
      .order("created_at", { ascending: true }),
  ]);

  if (reactionsResult.error) throw reactionsResult.error;
  if (commentsResult.error) throw commentsResult.error;

  for (const r of reactionsResult.data ?? []) {
    const sourceId = sourceIdByTargetId.get(r.interaction_target_id);
    const s = sourceId ? summaries.get(sourceId) : undefined;
    if (!s) continue;
    s.reactionCount += 1;
    if (user && r.user_id === user.id) s.viewerReacted = true;
  }

  const commentRows = commentsResult.data ?? [];
  const authorIds = [...new Set(commentRows.map((c) => c.author_id))];
  const [nameByAuthor, commentTargetRefs] = await Promise.all([
    resolveAuthorNames(supabase, authorIds),
    getInteractionTargetRefs(
      supabase,
      commentRows.map((comment) => ({ kind: "comment", sourceId: comment.id })),
    ),
  ]);
  let moderatableTargetIds = new Set<string>();
  if (user) {
    const { data: ids, error: moderationError } = await supabase.rpc(
      "moderatable_target_ids",
      {
        candidate_target_type: targetType,
        candidate_target_ids: targetIds,
      },
    );
    if (moderationError) throw moderationError;
    moderatableTargetIds = new Set((ids ?? []) as string[]);
  }

  const seenPerTarget = new Map<string, number>();
  for (const c of commentRows) {
    const sourceId = sourceIdByTargetId.get(c.interaction_target_id);
    if (!sourceId) continue;
    const s = summaries.get(sourceId);
    if (!s) continue;
    const commentTargetRef = commentTargetRefs.get(`comment:${c.id}`);
    if (!commentTargetRef) {
      // Un comentario cuyo target canónico no resuelve es un hecho de
      // VISIBILIDAD (el espectador no lo ve por RLS), no corrupción: se
      // descarta ese comentario, no el lote entero (#340). El throw estricto
      // se mantiene solo a nivel de fuente, arriba.
      console.error(
        `[social] interaction target unresolved, skipping comment:${c.id}`,
      );
      continue;
    }
    s.commentCount += 1;
    const seen = (seenPerTarget.get(c.interaction_target_id) ?? 0) + 1;
    seenPerTarget.set(c.interaction_target_id, seen);
    if (seen > COMMENT_PREFETCH_LIMIT) continue;
    const identity = nameByAuthor.get(c.author_id) ?? {
      name: "—",
      username: null,
      avatarUrl: null,
    };
    s.comments.push({
      id: c.id,
      interactionTargetId: commentTargetRef.id,
      authorId: c.author_id,
      author: identity.name,
      authorUsername: identity.username,
      authorAvatarUrl: identity.avatarUrl,
      initials: initials(identity.name) || "?",
      body: c.body,
      createdAt: c.created_at,
      isOwn: user?.id === c.author_id,
      canDelete: user?.id === c.author_id || moderatableTargetIds.has(sourceId),
      reactionCount: 0,
      viewerReacted: false,
    });
  }

  // Reacciones sobre los propios comentarios (like en comentario, EPIC-05
  // Bloque F) -- segunda query batch, los ids de comentario no se conocen
  // hasta después de la query de arriba. commentById indexa por id sobre
  // TODOS los comentarios devueltos (no solo los de la página de
  // COMMENT_PREFETCH_LIMIT que ya están en s.comments) para no complicar el
  // filtrado -- reacciones de comentarios fuera de la página prefetch
  // simplemente no encuentran destino en el bucle de abajo y se ignoran.
  // Mismo criterio que arriba: los comentarios sin target resoluble se caen
  // del lote en vez de tumbarlo (#340).
  const commentInteractionTargetIds = commentRows
    .map((c) => commentTargetRefs.get(`comment:${c.id}`)?.id)
    .filter((id): id is string => id !== undefined);
  if (commentInteractionTargetIds.length > 0) {
    const { data: commentReactions, error: commentReactionsError } = await supabase
      .from("reactions")
      .select("interaction_target_id, user_id")
      .in("interaction_target_id", commentInteractionTargetIds);
    if (commentReactionsError) throw commentReactionsError;

    const commentById = new Map<string, InteractionComment>();
    for (const s of summaries.values()) {
      for (const c of s.comments) commentById.set(c.interactionTargetId, c);
    }
    for (const r of commentReactions ?? []) {
      const c = commentById.get(r.interaction_target_id);
      if (!c) continue;
      c.reactionCount += 1;
      if (user && r.user_id === user.id) c.viewerReacted = true;
    }
  }

  return summaries;
}
