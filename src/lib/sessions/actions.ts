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

  // Los minutos son solo de lectura (§7.14): una sesión de serie registra qué
  // episodio alcanzaste, no cuánto tardaste — la duración de una serie es una
  // propiedad del ítem (series.episode_runtime_minutes), no del usuario. El
  // formulario ya no pinta el campo para series, pero una server action es un
  // endpoint POST público: hay que ignorarlo aquí, no confiar en la UI.
  const durationRaw =
    itemType === "book" ? String(formData.get("durationMinutes") ?? "").trim() : "";
  let durationMinutes: number | null = null;
  if (durationRaw) {
    durationMinutes = Number(durationRaw);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
      return { error: "invalidDuration" };
    }
  }

  const note = String(formData.get("note") ?? "").trim();

  let maxPosition: number | null = null;
  if (itemType === "book") {
    const { data: book } = await supabase
      .from("books")
      .select("total_pages")
      .eq("id", itemId)
      .maybeSingle();
    maxPosition = book?.total_pages ?? null;
  } else if (itemType === "series") {
    const { data: series } = await supabase
      .from("series")
      .select("total_episodes")
      .eq("id", itemId)
      .maybeSingle();
    maxPosition = series?.total_episodes ?? null;
  }

  // Position reached in this session. Optional: a time-only session (no
  // position entered) is valid and doesn't move the entry's position.
  let sessionPosition: Position = {};
  if (itemType === "book") {
    const pageRaw = String(formData.get("page") ?? "").trim();
    if (pageRaw) {
      const page = Number(pageRaw);
      if (!Number.isInteger(page) || page < 0) return { error: "invalidPosition" };
      if (maxPosition !== null && page > maxPosition) return { error: "invalidPosition" };
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
      if (maxPosition !== null && episode > maxPosition) {
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
    // Same queue cleanup as updateStatus (§7.22) — a session can also roll
    // status out of "planned", which should drop the queue membership+order.
    const { error: updateError } = await supabase
      .from("library_entries")
      .update({
        ...(nextPosition && { position: nextPosition }),
        ...(status && {
          status,
          ...(status !== "planned" && { queue_id: null, queue_order: null }),
        }),
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
