"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { BOOK_FORMATS, type BookFormat, type Position } from "@/lib/library/position";

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

export async function updateStatus(entryId: string, status: MediaStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("library_entries")
    .update({ status })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/u/[username]", "page");
}

export type UpdateProgressState = {
  error?: "invalidRating" | "invalidPosition" | "generic";
};

export async function updateProgress(
  entryId: string,
  itemType: ItemType,
  _prevState: UpdateProgressState,
  formData: FormData
): Promise<UpdateProgressState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ratingRaw = String(formData.get("rating") ?? "").trim();
  let rating: number | null = null;
  if (ratingRaw) {
    rating = Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return { error: "invalidRating" };
    }
  }

  const notes = String(formData.get("notes") ?? "").trim();

  let position: Position = {};
  if (itemType === "book") {
    const pageRaw = String(formData.get("page") ?? "").trim();
    const formatRaw = String(formData.get("format") ?? "").trim();

    let page: number | undefined;
    if (pageRaw) {
      page = Number(pageRaw);
      if (!Number.isInteger(page) || page < 0) return { error: "invalidPosition" };
    }

    let format: BookFormat | undefined;
    if (formatRaw) {
      if (!BOOK_FORMATS.includes(formatRaw as BookFormat)) {
        return { error: "invalidPosition" };
      }
      format = formatRaw as BookFormat;
    }

    position = { ...(page !== undefined && { page }), ...(format && { format }) };
  } else if (itemType === "series") {
    const seasonRaw = String(formData.get("season") ?? "").trim();
    const episodeRaw = String(formData.get("episode") ?? "").trim();
    if (seasonRaw || episodeRaw) {
      const season = Number(seasonRaw);
      const episode = Number(episodeRaw);
      if (
        !Number.isInteger(season) ||
        !Number.isInteger(episode) ||
        season < 0 ||
        episode < 0
      ) {
        return { error: "invalidPosition" };
      }
      position = { season, episode };
    }
  }

  const { error } = await supabase
    .from("library_entries")
    .update({ rating, position, notes: notes || null })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidatePath("/u/[username]", "page");
  return {};
}

export async function removeFromLibrary(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("library_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidatePath("/u/[username]", "page");
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
