"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "./notifications";
import type { TargetType } from "./interactions";

// Mutaciones de reacciones/comentarios (EPIC-05, Bloque B, SD-3). Sin edición
// de comentarios ni borrado por el dueño del contenido en este MVP (decisión
// explícita del diseño) — solo alta y borrado de lo propio.

// Revalida las tres páginas de ficha: la reseña puede vivir en cualquiera.
function revalidateItemPages() {
  revalidatePath("/libro/[id]", "page");
  revalidatePath("/pelicula/[id]", "page");
  revalidatePath("/serie/[id]", "page");
}

async function resolveTargetOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetType: TargetType,
  targetId: string,
): Promise<string | null> {
  const table = targetType === "diary_entry" ? "diary_entries" : "episode_watches";
  const { data, error } = await supabase
    .from(table)
    .select("user_id")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}

export async function toggleReaction(
  targetType: TargetType,
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
          type: "review_liked",
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
        type: "review_commented",
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
