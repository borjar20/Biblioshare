"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { BOOK_FORMATS, type BookFormat, type Position } from "@/lib/library/position";

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
  revalidatePath("/biblioteca");
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

  revalidatePath("/biblioteca");
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
  revalidatePath("/biblioteca");
}
