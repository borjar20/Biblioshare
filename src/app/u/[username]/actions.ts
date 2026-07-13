"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Library-entry management actions (status/progress/remove) live in
// src/lib/library/manage-actions.ts since the item detail pages became the
// management hub (§7.14) — only profile-specific actions remain here.

export async function updateProfileVisibility(
  username: string,
  isPublic: boolean
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ is_public: isPublic })
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath(`/u/${username}`);
}

// toggleFavorite se mudó a src/lib/library/favorite-actions.ts: la biblioteca
// se ve ahora desde /coleccion y desde /u/[username], así que la acción ya no
// pertenece a la ruta de perfil.
