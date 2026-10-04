"use server";

import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getActivePass } from "@/lib/passes/get-passes";
import { getEditions } from "@/lib/editions/get-editions";
import { pagesForPass } from "@/lib/editions/edition-label";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";
import { buildMarginAnchor } from "./anchor";
import { deliverMarginNotices } from "./deliver";
import { MARGIN_BODY_MAX, MARGIN_CHAPTER_MAX } from "./types";

export type MarginError =
  | "unauthenticated" | "invalidPosition" | "invalidBody" | "invalidChapter" | "recipientNotFollower" | "generic";
type Result = { ok: true; id: string } | { ok: false; error: MarginError };

export type CreateMarginNoteInput = {
  itemType: ItemType; itemId: string;
  page?: number | null; season?: number | null; episode?: number | null;
  chapterLabel: string | null; body: string; isSpoiler: boolean; recipientId: string | null;
};

function cleanChapter(itemType: ItemType, raw: string | null): string | null | false {
  if (itemType !== "book") return null;
  const v = (raw ?? "").trim();
  return v.length >= 1 && v.length <= MARGIN_CHAPTER_MAX ? v : false;
}

function cleanBody(raw: string): string | false {
  const v = raw.trim();
  return v.length >= 1 && v.length <= MARGIN_BODY_MAX ? v : false;
}

export async function createMarginNote(input: CreateMarginNoteInput): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const body = cleanBody(input.body);
  if (body === false) return { ok: false, error: "invalidBody" };
  const chapter = cleanChapter(input.itemType, input.chapterLabel);
  if (chapter === false) return { ok: false, error: "invalidChapter" };

  // Páginas de la edición del pase de quien escribe (misma regla que addSession).
  let pages: number | null = null;
  if (input.itemType === "book" && input.page != null) {
    const pass = await getActivePass(supabase, "book", input.itemId, user.id);
    const editions = pass?.editionId ? await getEditions("book", input.itemId) : [];
    const passEdition = editions.find((e) => e.id === pass?.editionId) ?? null;
    let workTotal: number | null = null;
    if (passEdition?.totalUnits == null) {
      const { data: book } = await supabase.from("books").select("total_pages").eq("id", input.itemId).maybeSingle();
      workTotal = book?.total_pages ?? null;
    }
    pages = pagesForPass(passEdition, workTotal);
  }

  const built = input.itemType === "book"
    ? buildMarginAnchor({ itemType: "book", page: input.page ?? null, pages })
    : input.itemType === "series"
      ? buildMarginAnchor({ itemType: "series", season: input.season ?? null, episode: input.episode ?? null })
      : buildMarginAnchor({ itemType: "movie" });
  if (!built.ok) return { ok: false, error: "invalidPosition" };

  const { data, error } = await supabase.from("margin_notes").insert({
    author_id: user.id, item_type: input.itemType, item_id: input.itemId, anchor: built.anchor,
    chapter_label: chapter, body, is_spoiler: input.isSpoiler,
    audience: input.recipientId ? "person" : "followers", recipient_id: input.recipientId,
  }).select("id").single();
  if (error) {
    if (error.code === "42501") return { ok: false, error: "recipientNotFollower" };
    if (error.code === "22023") return { ok: false, error: "invalidPosition" };
    console.error(error);
    return { ok: false, error: "generic" };
  }
  await deliverMarginNotices(supabase); // dedicada retroactiva
  revalidateReadingLog(input.itemType, input.itemId);
  return { ok: true, id: data.id };
}

export async function updateMarginNote(id: string,
  patch: { body: string; chapterLabel: string | null; isSpoiler: boolean }): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { data: current } = await supabase.from("margin_notes").select("item_type, item_id")
    .eq("id", id).eq("author_id", user.id).maybeSingle();
  if (!current) return { ok: false, error: "generic" };
  const body = cleanBody(patch.body);
  if (body === false) return { ok: false, error: "invalidBody" };
  const chapter = cleanChapter(current.item_type, patch.chapterLabel);
  if (chapter === false) return { ok: false, error: "invalidChapter" };
  const { error } = await supabase.from("margin_notes")
    .update({ body, chapter_label: chapter, is_spoiler: patch.isSpoiler }).eq("id", id);
  if (error) { console.error(error); return { ok: false, error: "generic" }; }
  revalidateReadingLog(current.item_type, current.item_id);
  return { ok: true, id };
}

export async function deleteMarginNote(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: current } = await supabase.from("margin_notes").select("item_type, item_id")
    .eq("id", id).eq("author_id", user.id).maybeSingle();
  if (!current) return { ok: false };
  const { error } = await supabase.from("margin_notes").delete().eq("id", id);
  if (error) { console.error(error); return { ok: false }; }
  revalidateReadingLog(current.item_type, current.item_id);
  return { ok: true };
}

export async function markMarginSeen(encounterIds: string[]): Promise<void> {
  if (!Array.isArray(encounterIds) || encounterIds.length === 0 || encounterIds.length > 50) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("margin_note_encounters").update({ seen_at: new Date().toISOString() })
    .in("id", encounterIds).eq("reader_id", user.id).is("seen_at", null);
  await deliverMarginNotices(supabase);
}
