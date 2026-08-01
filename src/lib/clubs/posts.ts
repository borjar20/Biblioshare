"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/social/notifications";
import { notifyMentions } from "@/lib/social/notify-mentions";
import { getInteractionSummary, type InteractionComment } from "@/lib/social/interactions";
import { resolveKnownMentions } from "@/lib/social/resolve-mentions";
import {
  resolveSharedActivity,
  type ShareRef,
  type SharedActivityPreview,
} from "@/lib/social/shared-activity";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export type ClubPollOption = {
  id: string;
  label: string;
  voteCount: number | null; // null mientras los resultados siguen ocultos
};

export type ClubPoll = {
  endsAt: string;
  isClosed: boolean;
  viewerOptionId: string | null;
  resultsVisible: boolean;
  options: ClubPollOption[];
};

export type ClubPost = {
  id: string;
  interactionTargetId: string;
  clubId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  kind: "text" | "activity_share" | "poll";
  body: string;
  createdAt: string;
  sharedActivity: SharedActivityPreview | null; // solo kind='activity_share'; null también si la fila origen ya no existe
  poll: ClubPoll | null; // solo kind='poll'
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};

export type ClubPostsPage = {
  posts: ClubPost[];
  nextCursor: string | null;
  // Usernames @mencionados (en `body` de los posts y de sus comentarios) que
  // existen de verdad — resuelto en UNA query, para linkificar sin volver a
  // tocar la BD desde el cliente.
  knownUsernames: string[];
};

const PAGE_SIZE = 20;

// Espejo de los CHECKs de BD (20260715_text_length_limits.sql): la BD es la
// garantía, esto da el error legible antes del roundtrip.
const MAX_BODY_LENGTH = 5000;
const MAX_OPTION_LENGTH = 120;

const SHARE_SOURCE_TABLES: ReadonlySet<string> = new Set([
  "diary_entries_added",
  "progress_sessions",
  "diary_entries",
  "episode_watches",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fan-out a los miembros activos, excepto el autor — vía notifyMany(): un solo
// INSERT multi-fila + push en lote, en vez de notify() por miembro (EPIC-05
// Bloque F; se acepta el ruido temporal, silenciar-club queda diferido a E5.J).
// postId es opcional: cuando se conoce (texto/compartido, Task 4) target_type/
// target_id apuntan al post concreto ('club_post'), más preciso que antes.
// createPoll no lo pasa porque create_club_poll() (RPC) no devuelve el id del
// post creado (returns void) — se mantiene el target_type='club' original
// (apunta al club, resuelve al mismo href) para no romper su comportamiento
// existente. Ver limitación anotada en createPoll: sin menciones tampoco por
// el mismo motivo.
// excludeUserIds: los ya notificados por @mención (Task 4) para no duplicar
// aviso — se suman a la exclusión del propio autor.
async function notifyNewPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  authorId: string,
  postId?: string,
  excludeUserIds: string[] = [],
): Promise<void> {
  try {
    const { data: members } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", clubId)
      .eq("status", "active")
      .neq("user_id", authorId);
    const exclude = new Set(excludeUserIds);
    const userIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => !exclude.has(id));
    await notifyMany(supabase, {
      userIds,
      actorId: authorId,
      type: "club_post",
      targetType: postId ? "club_post" : "club",
      targetId: postId ?? clubId,
    });
  } catch (error) {
    console.error("notifyNewPost failed", error);
  }
}

async function notifyPostMentions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorId: string,
  text: string,
  postId: string,
): Promise<string[]> {
  try {
    const { data: target, error } = await supabase
      .from("interaction_targets")
      .select("id")
      .eq("kind", "club_post")
      .eq("source_id", postId)
      .maybeSingle();
    if (error) throw error;
    if (!target) return [];
    return await notifyMentions(supabase, {
      authorId,
      text,
      interactionTargetId: target.id,
    });
  } catch (error) {
    console.error("notifyPostMentions failed", error);
    return [];
  }
}

export async function createTextPost(clubId: string, body: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("body_required");
  if (trimmed.length > MAX_BODY_LENGTH) throw new Error("body_too_long");

  const { data: post, error } = await supabase
    .from("club_posts")
    .insert({ club_id: clubId, author_id: userId, kind: "text", body: trimmed })
    .select("id")
    .single();
  if (error) throw error;

  const mentioned = await notifyPostMentions(supabase, userId, trimmed, post.id);
  await notifyNewPost(supabase, clubId, userId, post.id, mentioned);
  revalidateClubPages();
}

export async function createShareActivityPost(
  clubId: string,
  body: string,
  ref: ShareRef,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("body_required");
  if (trimmed.length > MAX_BODY_LENGTH) throw new Error("body_too_long");
  // Forma canónica del ref antes de tocar la BD. La garantía real (que la fila
  // exista y sea DEL AUTOR) la revalida el trigger validate_club_post_ref y la
  // política de lectura is_visible_via_club_share — esto solo corta basura
  // evidente con un error claro.
  if (!SHARE_SOURCE_TABLES.has(ref.sourceTable) || !UUID_RE.test(ref.rowId)) {
    throw new Error("invalid_ref");
  }
  const cleanRef: ShareRef = { sourceTable: ref.sourceTable, rowId: ref.rowId };

  const { data: post, error } = await supabase
    .from("club_posts")
    .insert({ club_id: clubId, author_id: userId, kind: "activity_share", body: trimmed, ref: cleanRef })
    .select("id")
    .single();
  if (error) throw error;

  const mentioned = await notifyPostMentions(supabase, userId, trimmed, post.id);
  await notifyNewPost(supabase, clubId, userId, post.id, mentioned);
  revalidateClubPages();
}

export async function createPoll(
  clubId: string,
  question: string,
  options: string[],
  endsAt: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmedQuestion = question.trim();
  const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
  if (!trimmedQuestion) throw new Error("question_required");
  if (trimmedQuestion.length > MAX_BODY_LENGTH) throw new Error("body_too_long");
  if (trimmedOptions.length < 2) throw new Error("at_least_two_options_required");
  if (trimmedOptions.some((o) => o.length > MAX_OPTION_LENGTH)) throw new Error("option_too_long");

  // LÍMITE CONOCIDO (Task 4 de menciones): create_club_poll() (SECURITY
  // DEFINER, schema-baseline.sql) devuelve `void`, no el id del post creado —
  // sin él no hay target_id para notifyMentions() ni forma de apuntar el
  // fan-out genérico al post concreto. La pregunta del poll SÍ es texto libre
  // y podría llevar @menciones, pero se quedan sin notificar aquí. Arreglo
  // correcto: hacer que la RPC devuelva el id (`returns uuid`) — pendiente,
  // issue a abrir en Task 8.
  const { error } = await supabase.rpc("create_club_poll", {
    p_club_id: clubId,
    p_question: trimmedQuestion,
    p_options: trimmedOptions,
    p_ends_at: endsAt,
  });
  if (error) throw error;

  await notifyNewPost(supabase, clubId, userId);
  revalidateClubPages();
}

export async function votePoll(postId: string, optionId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("vote_club_poll", { p_post_id: postId, p_option_id: optionId });
  if (error) throw error;
  revalidateClubPages();
}

export async function deletePost(postId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("club_posts").delete().eq("id", postId);
  if (error) throw error;
  revalidateClubPages();
}

export async function listClubPosts(clubId: string, cursor?: string): Promise<ClubPostsPage> {
  const { supabase, userId } = await requireUser();

  let query = supabase
    .from("club_posts")
    .select("id, club_id, author_id, kind, body, ref, poll_ends_at, created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) query = query.lt("created_at", cursor);

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) return { posts: [], nextCursor: null, knownUsernames: [] };

  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: authors } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", authorIds);
  const authorById = new Map(
    (authors ?? [])
      .filter((a): a is typeof a & { user_id: string; username: string } => a.user_id != null && a.username != null)
      .map((a) => [a.user_id, a]),
  );

  // activity_share: resuelto fila a fila (no batcheado) -- una página de
  // feed de club es pequeña (PAGE_SIZE=20) y solo una fracción suele ser
  // activity_share; batchear por las 4 tablas fuente heterogéneas
  // duplicaría buena parte de getFeed()'s complejidad para un ahorro
  // marginal en este contexto.
  const shareableRows = rows.filter((r) => r.kind === "activity_share" && r.ref);
  const sharedByPostId = new Map<string, SharedActivityPreview | null>(
    await Promise.all(
      shareableRows.map(
        async (r): Promise<[string, SharedActivityPreview | null]> => [
          r.id,
          await resolveSharedActivity(supabase, r.ref as unknown as ShareRef),
        ],
      ),
    ),
  );

  // poll: opciones + votos batcheados por post.
  const pollPostIds = rows.filter((r) => r.kind === "poll").map((r) => r.id);
  const [optionsResult, votesResult] = await Promise.all([
    pollPostIds.length
      ? supabase.from("club_poll_options").select("id, post_id, label, position").in("post_id", pollPostIds)
      : Promise.resolve({ data: [] as { id: string; post_id: string; label: string; position: number }[] }),
    pollPostIds.length
      ? supabase.from("club_poll_votes").select("post_id, user_id, option_id").in("post_id", pollPostIds)
      : Promise.resolve({ data: [] as { post_id: string; user_id: string; option_id: string }[] }),
  ]);
  const optionsByPost = new Map<string, { id: string; label: string; position: number }[]>();
  for (const o of optionsResult.data ?? []) {
    const list = optionsByPost.get(o.post_id) ?? [];
    list.push({ id: o.id, label: o.label, position: o.position });
    optionsByPost.set(o.post_id, list);
  }
  const votesByPost = new Map<string, { userId: string; optionId: string }[]>();
  for (const v of votesResult.data ?? []) {
    const list = votesByPost.get(v.post_id) ?? [];
    list.push({ userId: v.user_id, optionId: v.option_id });
    votesByPost.set(v.post_id, list);
  }

  // Interacciones (Bloque B, target_type='club_post') batcheadas para toda
  // la página.
  const summaries = await getInteractionSummary(
    supabase,
    "club_post",
    rows.map((r) => r.id),
  );

  const posts: ClubPost[] = rows
    .map((r): ClubPost | null => {
      const author = authorById.get(r.author_id);
      if (!author) return null;
      const summary = summaries.get(r.id);
      if (!summary) throw new Error(`Interaction summary missing for club_post:${r.id}`);

      let poll: ClubPoll | null = null;
      if (r.kind === "poll" && r.poll_ends_at) {
        const isClosed = new Date(r.poll_ends_at) <= new Date();
        const votes = votesByPost.get(r.id) ?? [];
        const viewerVote = votes.find((v) => v.userId === userId);
        const resultsVisible = isClosed || viewerVote != null;
        const options = (optionsByPost.get(r.id) ?? []).sort((a, b) => a.position - b.position);
        poll = {
          endsAt: r.poll_ends_at,
          isClosed,
          viewerOptionId: viewerVote?.optionId ?? null,
          resultsVisible,
          options: options.map((o) => ({
            id: o.id,
            label: o.label,
            voteCount: resultsVisible ? votes.filter((v) => v.optionId === o.id).length : null,
          })),
        };
      }

      return {
        id: r.id,
        interactionTargetId: summary.interactionTargetId,
        clubId: r.club_id,
        authorId: r.author_id,
        authorUsername: author.username,
        authorDisplayName: author.display_name,
        authorAvatarUrl: author.avatar_url,
        kind: r.kind,
        body: r.body,
        createdAt: r.created_at,
        sharedActivity: sharedByPostId.get(r.id) ?? null,
        poll,
        reactionCount: summary.reactionCount,
        viewerReacted: summary.viewerReacted,
        commentCount: summary.commentCount,
        comments: summary.comments,
      };
    })
    .filter((p): p is ClubPost => p !== null);

  const nextCursor = rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null;

  const knownUsernames = await resolveKnownMentions(supabase, [
    ...posts.map((p) => p.body),
    ...posts.flatMap((p) => p.comments.map((c) => c.body)),
  ]);

  return { posts, nextCursor, knownUsernames };
}
