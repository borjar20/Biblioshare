"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import type { MediaStatus } from "./types";
import { BOOK_FORMATS, type BookFormat, type Position } from "./position";

// These actions are shared between the item detail pages (the management
// hub since §7.14) and any other surface, so they revalidate every view
// that renders library state: detail page, profile, and home shelf.
function revalidateItemViews(itemType: ItemType, itemId: string) {
  revalidatePath(itemHref(itemType, itemId));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

export async function updateStatus(
  entryId: string,
  itemType: ItemType,
  itemId: string,
  status: MediaStatus
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // An item leaving "planned" shouldn't keep a stale queue membership or
  // position — it would otherwise resurface in its old queue at an old spot if
  // it's re-planned later. See docs/REQUIREMENTS.md §7.22.
  const { error } = await supabase
    .from("library_entries")
    .update({
      status,
      ...(status !== "planned" && { queue_id: null, queue_order: null }),
    })
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateItemViews(itemType, itemId);
}

export type UpdateProgressState = {
  error?: "invalidRating" | "invalidPosition" | "generic";
};

export async function updateProgress(
  entryId: string,
  itemType: ItemType,
  itemId: string,
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

  revalidateItemViews(itemType, itemId);
  return {};
}

export async function removeFromLibrary(
  entryId: string,
  itemType: ItemType,
  itemId: string
) {
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
  revalidateItemViews(itemType, itemId);
}

// Moves a planned item into a named queue (or the "Sin cola" bucket when
// queueId is null) from the item detail page (§7.22). queue_order is reset to
// null so ensureQueueOrder appends it to the end of the target queue on the
// next /cola visit. A foreign queue id is rejected by the FK + queues RLS.
export async function moveEntryToQueue(
  entryId: string,
  itemType: ItemType,
  itemId: string,
  queueId: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("library_entries")
    .update({ queue_id: queueId, queue_order: null })
    .eq("id", entryId)
    .eq("user_id", user.id)
    .eq("status", "planned");

  if (error) throw error;
  revalidateItemViews(itemType, itemId);
  revalidatePath("/coleccion");
}
