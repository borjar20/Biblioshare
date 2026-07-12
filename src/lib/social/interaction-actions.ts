"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "./notifications";
import type { NotificationType } from "./notification-types";
import type { ReactableTargetType, TargetType } from "./interactions";

// Mutaciones de reacciones/comentarios (EPIC-05, Bloque B, SD-3). Sin edición
// de comentarios ni borrado por el dueño del contenido en este MVP (decisión
// explícita del diseño) — solo alta y borrado de lo propio.

// Revalida las tres páginas de ficha: la reseña puede vivir en cualquiera.
function revalidateItemPages() {
  revalidatePath("/libro/[id]", "page");
  revalidatePath("/pelicula/[id]", "page");
  revalidatePath("/serie/[id]", "page");
  // EPIC-05 Bloque C: el feed también puede mostrar esta reacción/comentario
  // inline (ReviewInteractions reutilizado en FeedCard) — sin esto, un
  // like/comentario hecho desde el feed no se reflejaría hasta recargar.
  revalidatePath("/", "page");
}

// Dueño del target -- a quién notificar. club_post/comment usan author_id en
// vez de user_id (mismas columnas que sus tablas ya declaran).
async function resolveTargetOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetType: ReactableTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === "diary_entry" || targetType === "episode_watch") {
    const table = targetType === "diary_entry" ? "diary_entries" : "episode_watches";
    const { data, error } = await supabase.from(table).select("user_id").eq("id", targetId).maybeSingle();
    if (error) throw error;
    return data?.user_id ?? null;
  }
  if (targetType === "club_post") {
    const { data, error } = await supabase
      .from("club_posts")
      .select("author_id")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    return data?.author_id ?? null;
  }
  const { data, error } = await supabase
    .from("comments")
    .select("author_id")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw error;
  return data?.author_id ?? null;
}

// Reaccionar (like) notifica con un tipo distinto según qué se está
// reaccionando -- paridad completa con review_liked (EPIC-05 Bloque F,
// decisión de sesión). Comentar solo aplica a diary_entry/episode_watch/
// club_post (nunca a un comentario -- sin anidación).
const LIKE_NOTIFICATION_TYPE: Record<ReactableTargetType, NotificationType> = {
  diary_entry: "review_liked",
  episode_watch: "review_liked",
  club_post: "club_post_liked",
  comment: "comment_liked",
};
const COMMENT_NOTIFICATION_TYPE: Record<TargetType, NotificationType> = {
  diary_entry: "review_commented",
  episode_watch: "review_commented",
  club_post: "club_post_commented",
};

export async function toggleReaction(
  targetType: ReactableTargetType,
  targetId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing, error: selectError } = await supabase
    .from("reactions")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("user_id", user.id)
    .eq("kind", "like")
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("reactions").insert({
      target_type: targetType,
      target_id: targetId,
      user_id: user.id,
      kind: "like",
    });
    if (error) throw error;

    try {
      const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
      if (ownerId && ownerId !== user.id) {
        await notify(supabase, {
          userId: ownerId,
          actorId: user.id,
          type: LIKE_NOTIFICATION_TYPE[targetType],
          targetType,
          targetId,
        });
      }
    } catch (error) {
      console.error(error);
    }
  }
  revalidateItemPages();
}

export async function addComment(
  targetType: TargetType,
  targetId: string,
  body: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = body.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("comments").insert({
    target_type: targetType,
    target_id: targetId,
    author_id: user.id,
    body: trimmed,
  });
  if (error) throw error;

  try {
    const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
    if (ownerId && ownerId !== user.id) {
      await notify(supabase, {
        userId: ownerId,
        actorId: user.id,
        type: COMMENT_NOTIFICATION_TYPE[targetType],
        targetType,
        targetId,
      });
    }
  } catch (error) {
    console.error(error);
  }
  revalidateItemPages();
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", user.id);
  if (error) throw error;
  revalidateItemPages();
}
