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

/**
 * Un emoji del catálogo (`src/lib/social/emoji-catalog.data.ts`). Es un alias
 * documental, no un tipo cerrado: la lista blanca se valida en la acción de
 * servidor, no en el sistema de tipos.
 */
export type ReactionEmoji = string;
export type ReactionTally = { count: number; viewerReacted: boolean };
/**
 * Mapa DISPERSO: hay clave solo si alguien reaccionó con ese emoji. Indexar a
 * pelo (`reactions["🔥"]`) puede dar `undefined` — usa siempre `tallyOf`.
 * El orden de las claves es el de primera aparición, que es lo que
 * `reaction-display.ts` usa como desempate estable; por eso las consultas de
 * reacciones van ordenadas por `created_at`.
 */
export type ReactionsByEmoji = Record<ReactionEmoji, ReactionTally>;

export function emptyReactions(): ReactionsByEmoji {
  return {};
}

export function tallyOf(reactions: ReactionsByEmoji, emoji: string): ReactionTally {
  return reactions[emoji] ?? { count: 0, viewerReacted: false };
}

export function totalReactions(reactions: ReactionsByEmoji): number {
  let total = 0;
  for (const tally of Object.values(reactions)) total += tally.count;
  return total;
}

export function anyViewerReacted(reactions: ReactionsByEmoji): boolean {
  return Object.values(reactions).some((tally) => tally.viewerReacted);
}

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
  canEdit: boolean;
  canPin: boolean;
  parentId: string | null;
  isSpoiler: boolean;
  pinned: boolean;
  edited: boolean;
  // reactionCount/viewerReacted se conservan como DERIVADOS (suma de todos
  // los kinds / algún kind activo del viewer) para no romper a los 9
  // callers que aún pintan el total sin desglosar por emoji.
  reactionCount: number;
  viewerReacted: boolean;
  reactions: ReactionsByEmoji;
};

export type InteractionSummary = {
  interactionTargetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByEmoji;
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
      reactions: emptyReactions(),
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
      .select("interaction_target_id, user_id, kind")
      .in("interaction_target_id", interactionTargetIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("comments")
      .select("id, interaction_target_id, author_id, body, created_at, parent_id, is_spoiler, pinned, edited_at")
      .in("interaction_target_id", interactionTargetIds)
      .order("created_at", { ascending: true }),
  ]);

  if (reactionsResult.error) throw reactionsResult.error;
  if (commentsResult.error) throw commentsResult.error;

  for (const r of reactionsResult.data ?? []) {
    const sourceId = sourceIdByTargetId.get(r.interaction_target_id);
    const s = sourceId ? summaries.get(sourceId) : undefined;
    if (!s) continue;
    const emoji = r.kind;
    if (!emoji) continue; // fila sin kind: ignora, no rompas
    const tally = (s.reactions[emoji] ??= { count: 0, viewerReacted: false });
    tally.count += 1;
    if (user && r.user_id === user.id) tally.viewerReacted = true;
  }
  for (const s of summaries.values()) {
    s.reactionCount = totalReactions(s.reactions);
    s.viewerReacted = anyViewerReacted(s.reactions);
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

  const { data: ownerRows, error: ownerErr } = await supabase
    .from("interaction_targets")
    .select("id, owner_id")
    .in("id", interactionTargetIds);
  if (ownerErr) throw ownerErr;
  const viewerOwnsTarget = new Set(
    (ownerRows ?? [])
      .filter((r) => user && r.owner_id === user.id)
      .map((r) => sourceIdByTargetId.get(r.id)!)
      .filter(Boolean),
  );

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
      canEdit: user?.id === c.author_id,
      // Fijar es SOLO del dueño del target (no moderador/admin) — ver
      // 20260839_pin_comment_owner_only.sql. `moderatableTargetIds` se sigue
      // usando para `canDelete` (moderar = borrar sí es de admin/moderador).
      canPin: viewerOwnsTarget.has(sourceId),
      parentId: c.parent_id,
      isSpoiler: c.is_spoiler,
      pinned: c.pinned,
      edited: c.edited_at != null,
      reactionCount: 0,
      viewerReacted: false,
      reactions: emptyReactions(),
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
      .select("interaction_target_id, user_id, kind")
      .in("interaction_target_id", commentInteractionTargetIds)
      .order("created_at", { ascending: true });
    if (commentReactionsError) throw commentReactionsError;

    const commentById = new Map<string, InteractionComment>();
    for (const s of summaries.values()) {
      for (const c of s.comments) commentById.set(c.interactionTargetId, c);
    }
    for (const r of commentReactions ?? []) {
      const c = commentById.get(r.interaction_target_id);
      if (!c) continue;
      const emoji = r.kind;
      if (!emoji) continue;
      const tally = (c.reactions[emoji] ??= { count: 0, viewerReacted: false });
      tally.count += 1;
      if (user && r.user_id === user.id) tally.viewerReacted = true;
    }
    for (const c of commentById.values()) {
      c.reactionCount = totalReactions(c.reactions);
      c.viewerReacted = anyViewerReacted(c.reactions);
    }
  }

  return summaries;
}
