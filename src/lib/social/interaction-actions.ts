"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateInteraction } from "@/lib/reactivity/revalidate";
import { notify } from "./notifications";
import { notifyMentions } from "./notify-mentions";
import type { ReactionKind } from "./interactions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getInteractionTarget(
  supabase: SupabaseServerClient,
  interactionTargetId: string,
) {
  const { data, error } = await supabase
    .from("interaction_targets")
    .select(
      "id, owner_id, commentable, reactable, comment_notification_type, reaction_notification_type",
    )
    .eq("id", interactionTargetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("interaction_target_not_found");
  return data;
}

export async function toggleReaction(
  interactionTargetId: string,
  kind: ReactionKind = "like",
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const target = await getInteractionTarget(supabase, interactionTargetId);
  if (!target.reactable || !target.reaction_notification_type) {
    throw new Error("interaction_target_not_reactable");
  }

  const { data: existing, error: selectError } = await supabase
    .from("reactions")
    .select("id")
    .eq("interaction_target_id", interactionTargetId)
    .eq("user_id", user.id)
    .eq("kind", kind)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("interaction_target_id", interactionTargetId)
      .eq("user_id", user.id)
      .eq("kind", kind);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("reactions").insert({
      interaction_target_id: interactionTargetId,
      user_id: user.id,
      kind,
    });
    if (error) throw error;

    if (target.owner_id !== user.id) {
      try {
        await notify(supabase, {
          userId: target.owner_id,
          actorId: user.id,
          type: target.reaction_notification_type,
          interactionTargetId,
          // Idempotencia (spec item 9): un like → unlike → like no debe avisar
          // dos veces. Misma persona + mismo target = una notificación.
          dedupeKey: `reaction:${interactionTargetId}:${user.id}`,
        });
      } catch (notificationError) {
        console.error(notificationError);
      }
    }
  }

  revalidateInteraction();
}

export type CommentActionResult = { ok: true } | { ok: false; error: string };

export async function addComment(
  interactionTargetId: string,
  body: string,
  opts?: { parentId?: string; isSpoiler?: boolean },
): Promise<CommentActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "empty" };
    if (trimmed.length > 2000) return { ok: false, error: "too_long" };

    const target = await getInteractionTarget(supabase, interactionTargetId);
    if (!target.commentable || !target.comment_notification_type) {
      return { ok: false, error: "not_commentable" };
    }

    const { data: inserted, error } = await supabase
      .from("comments")
      .insert({
        interaction_target_id: interactionTargetId,
        author_id: user.id,
        body: trimmed,
        parent_id: opts?.parentId ?? null,
        is_spoiler: opts?.isSpoiler ?? false,
      })
      .select("id, parent_id")
      .single();
    if (error) throw error;

    let mentioned: string[] = [];
    // Target `kind='comment'` de este comentario (lo materializa el trigger
    // durante el insert). Su href lleva `#c-<id>` (migración 20260848), así que
    // apuntar una notificación a él hace deep-link al SUBHILO en vez de a la
    // cabecera del post. Lo reutilizan las menciones y el aviso de respuesta.
    let commentTargetId: string | null = null;
    try {
      const { data: commentTarget, error: commentTargetError } = await supabase
        .from("interaction_targets")
        .select("id")
        .eq("kind", "comment")
        .eq("source_id", inserted.id)
        .maybeSingle();
      if (commentTargetError) throw commentTargetError;
      if (commentTarget) {
        commentTargetId = commentTarget.id;
        mentioned = await notifyMentions(supabase, {
          authorId: user.id,
          text: trimmed,
          interactionTargetId: commentTarget.id,
        });
      }
    } catch (mentionError) {
      console.error(mentionError);
    }

    if (target.owner_id !== user.id && !mentioned.includes(target.owner_id)) {
      try {
        await notify(supabase, {
          userId: target.owner_id,
          actorId: user.id,
          type: target.comment_notification_type,
          interactionTargetId,
        });
      } catch (notificationError) {
        console.error(notificationError);
      }
    }

    // NUEVO: si es respuesta, avisar al autor del comentario padre (salvo
    // que sea uno mismo, el dueño del target, o ya haya sido @mencionado).
    if (inserted.parent_id) {
      try {
        const { data: parent } = await supabase
          .from("comments")
          .select("author_id")
          .eq("id", inserted.parent_id)
          .maybeSingle();
        if (
          parent &&
          parent.author_id !== user.id &&
          parent.author_id !== target.owner_id &&
          !mentioned.includes(parent.author_id)
        ) {
          await notify(supabase, {
            userId: parent.author_id,
            actorId: user.id,
            type: target.comment_notification_type,
            // Deep-link al SUBHILO: apunta al target del propio comentario
            // (href con `#c-<id>`, 20260848), no al del post — así el aviso
            // aterriza en la respuesta dentro del hilo, no en la cabecera
            // genérica. Fallback al post si el target no se resolvió.
            interactionTargetId: commentTargetId ?? interactionTargetId,
            dedupeKey: `reply:${inserted.id}`,
          });
        }
      } catch (replyNotificationError) {
        console.error(replyNotificationError);
      }
    }

    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("addComment failed", e);
    return { ok: false, error: "unknown" };
  }
}

export async function editComment(commentId: string, body: string): Promise<CommentActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "empty" };
    if (trimmed.length > 2000) return { ok: false, error: "too_long" };
    // RLS `comments update own canonical` + grant por columna: solo el autor,
    // solo body/edited_at. `.select` distingue 0 filas (bloqueado) de éxito.
    const { data, error } = await supabase
      .from("comments")
      .update({ body: trimmed, edited_at: new Date().toISOString() })
      .eq("id", commentId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, error: "not_allowed_or_missing" };
    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("editComment failed", e);
    return { ok: false, error: "unknown" };
  }
}

export async function pinComment(commentId: string, pinned: boolean): Promise<CommentActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };
    const { error } = await supabase.rpc("pin_comment", {
      p_comment_id: commentId,
      p_pinned: pinned,
    });
    if (error) return { ok: false, error: "not_allowed" }; // 42501 u otros → no autorizado
    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("pinComment failed", e);
    return { ok: false, error: "unknown" };
  }
}

export async function deleteComment(commentId: string): Promise<CommentActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) throw error;
    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("deleteComment failed", e);
    return { ok: false, error: "unknown" };
  }
}
