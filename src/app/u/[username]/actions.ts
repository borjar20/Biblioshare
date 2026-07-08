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

// Simple version of §7.9: a single flat set of up to MAX_FAVORITES pinned
// items, no reordering UI. `pinned_order` is only used to preserve a stable
// display order (oldest pin first), not exposed for manual reordering.
const MAX_FAVORITES = 6;

export type ToggleFavoriteState = {
  error?: "maxReached";
};

export async function toggleFavorite(
  entryId: string
): Promise<ToggleFavoriteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current, error: fetchError } = await supabase
    .from("library_entries")
    .select("pinned_order")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!current) return {};

  if (current.pinned_order !== null) {
    const { error } = await supabase
      .from("library_entries")
      .update({ pinned_order: null })
      .eq("id", entryId)
      .eq("user_id", user.id);

    if (error) throw error;
    revalidatePath("/u/[username]", "page");
    return {};
  }

  const { count, error: countError } = await supabase
    .from("library_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("pinned_order", "is", null);

  if (countError) throw countError;
  if ((count ?? 0) >= MAX_FAVORITES) return { error: "maxReached" };

  const { data: topPin, error: topPinError } = await supabase
    .from("library_entries")
    .select("pinned_order")
    .eq("user_id", user.id)
    .not("pinned_order", "is", null)
    .order("pinned_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (topPinError) throw topPinError;

  const { error } = await supabase
    .from("library_entries")
    .update({ pinned_order: (topPin?.pinned_order ?? 0) + 1 })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/u/[username]", "page");
  return {};
}
