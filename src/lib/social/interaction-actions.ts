"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateInteraction } from "@/lib/reactivity/revalidate";
import { notify } from "./notifications";
import { notifyMentions } from "./notify-mentions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getInteractionTarget(
  supabase: SupabaseServerClient,
  interactionTargetId: string,
) {
  const { data, error } = await supabase
    .from("interaction_targets")
    .select(
      "id, kind, source_id, owner_id, commentable, reactable, comment_notification_type, reaction_notification_type",
    )
    .eq("id", interactionTargetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("interaction_target_not_found");
  return data;
}

export async function toggleReaction(interactionTargetId: string): Promise<void> {
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
    .eq("kind", "like")
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("interaction_target_id", interactionTargetId)
      .eq("user_id", user.id)
      .eq("kind", "like");
    if (error) throw error;
  } else {
    const { error } = await supabase.from("reactions").insert({
      interaction_target_id: interactionTargetId,
      // Compatibilidad expand/migrate: ambas columnas siguen siendo NOT NULL.
      target_type: target.kind,
      target_id: target.source_id,
      user_id: user.id,
      kind: "like",
    });
    if (error) throw error;

    if (target.owner_id !== user.id) {
      try {
        await notify(supabase, {
          userId: target.owner_id,
          actorId: user.id,
          type: target.reaction_notification_type,
          interactionTargetId,
        });
      } catch (notificationError) {
        console.error(notificationError);
      }
    }
  }

  revalidateInteraction();
}

export async function addComment(
  interactionTargetId: string,
  body: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = body.trim();
  if (!trimmed) return;
  if (trimmed.length > 2000) throw new Error("comment_too_long");

  const target = await getInteractionTarget(supabase, interactionTargetId);
  if (!target.commentable || !target.comment_notification_type) {
    throw new Error("interaction_target_not_commentable");
  }

  const { data: inserted, error } = await supabase
    .from("comments")
    .insert({
      interaction_target_id: interactionTargetId,
      // Compatibilidad expand/migrate: ambas columnas siguen siendo NOT NULL.
      target_type: target.kind,
      target_id: target.source_id,
      author_id: user.id,
      body: trimmed,
    })
    .select("id")
    .single();
  if (error) throw error;

  let mentioned: string[] = [];
  try {
    const { data: commentTarget, error: commentTargetError } = await supabase
      .from("interaction_targets")
      .select("id")
      .eq("kind", "comment")
      .eq("source_id", inserted.id)
      .maybeSingle();
    if (commentTargetError) throw commentTargetError;
    if (commentTarget) {
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

  revalidateInteraction();
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
  revalidateInteraction();
}
