"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { parsePosition, type Position } from "@/lib/library/position";
import type { MediaStatus } from "@/lib/library/types";

const VALID_STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

// Session writes touch three views: the item detail page, the profile
// (progress bars / "Ahora mismo"), and the home shelf.
function revalidateItemViews(itemType: ItemType, itemId: string) {
  revalidatePath(itemHref(itemType, itemId));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

export type AddSessionState = {
  error?: "invalidPosition" | "invalidDuration" | "generic";
};

// Logs a reading/watching session AND rolls the entry's current state
// forward (position + status) — the session form is the daily-loop way of
// updating progress. See docs/REQUIREMENTS.md §7.14.
export async function addSession(
  entryId: string,
  itemType: ItemType,
  itemId: string,
  _prevState: AddSessionState,
  formData: FormData
): Promise<AddSessionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entry, error: entryError } = await supabase
    .from("library_entries")
    .select("id, position")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (entryError) return { error: "generic" };
  if (!entry) return { error: "generic" };

  const sessionDate = String(formData.get("sessionDate") ?? "").trim();

  const durationRaw = String(formData.get("durationMinutes") ?? "").trim();
  let durationMinutes: number | null = null;
  if (durationRaw) {
    durationMinutes = Number(durationRaw);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
      return { error: "invalidDuration" };
    }
  }

  const note = String(formData.get("note") ?? "").trim();

  // Position reached in this session. Optional: a time-only session (no
  // position entered) is valid and doesn't move the entry's position.
  let sessionPosition: Position = {};
  if (itemType === "book") {
    const pageRaw = String(formData.get("page") ?? "").trim();
    if (pageRaw) {
      const page = Number(pageRaw);
      if (!Number.isInteger(page) || page < 0) return { error: "invalidPosition" };
      sessionPosition = { page };
    }
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
      sessionPosition = { season, episode };
    }
  }

  const statusRaw = String(formData.get("status") ?? "").trim();
  const status = VALID_STATUSES.includes(statusRaw as MediaStatus)
    ? (statusRaw as MediaStatus)
    : undefined;

  const { error: insertError } = await supabase.from("progress_sessions").insert({
    library_entry_id: entryId,
    user_id: user.id,
    ...(sessionDate && { session_date: sessionDate }),
    duration_minutes: durationMinutes,
    position: sessionPosition,
    note: note || null,
  });

  if (insertError) return { error: "generic" };

  // Roll the entry's current position forward. For books, merge so the
  // copy's `format` (part of the same JSONB) isn't lost by a page update.
  const hasSessionPosition = Object.keys(sessionPosition).length > 0;
  const currentPosition = parsePosition(itemType, entry.position);
  const nextPosition = hasSessionPosition
    ? itemType === "book"
      ? { ...currentPosition, ...sessionPosition }
      : sessionPosition
    : undefined;

  if (nextPosition || status) {
    const { error: updateError } = await supabase
      .from("library_entries")
      .update({
        ...(nextPosition && { position: nextPosition }),
        ...(status && { status }),
      })
      .eq("id", entryId)
      .eq("user_id", user.id);

    if (updateError) return { error: "generic" };
  }

  revalidateItemViews(itemType, itemId);
  redirect(itemHref(itemType, itemId));
}

export async function deleteSession(
  sessionId: string,
  itemType: ItemType,
  itemId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("progress_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateItemViews(itemType, itemId);
}
