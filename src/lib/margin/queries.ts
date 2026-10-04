import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MarginAnchor, MarginNoteView, MarginPerson } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const NOTE_COLS =
  "id, author_id, item_type, item_id, anchor, chapter_label, body, is_spoiler, audience, recipient_id, created_at";

type NoteRow = {
  id: string; author_id: string; item_type: ItemType; item_id: string; anchor: MarginAnchor;
  chapter_label: string | null; body: string; is_spoiler: boolean; audience: "followers" | "person";
  recipient_id: string | null; created_at: string;
};
type EncounterRow = {
  id: string; note_id: string; reader_id: string; found_at: string;
  found_via: "progress" | "finish" | "retro"; seen_at: string | null;
};

async function people(supabase: SupabaseServerClient, ids: string[]): Promise<Map<string, MarginPerson>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.user_id, {
    id: p.user_id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url,
  }]));
}

const UNKNOWN: MarginPerson = { id: "", username: "", displayName: null, avatarUrl: null };

function view(note: NoteRow, who: Map<string, MarginPerson>, encounter: EncounterRow | null,
  foundBy: MarginNoteView["foundBy"]): MarginNoteView {
  return {
    noteId: note.id, itemType: note.item_type, itemId: note.item_id, anchor: note.anchor,
    chapterLabel: note.chapter_label, body: note.body, isSpoiler: note.is_spoiler,
    audience: note.audience, createdAt: note.created_at,
    author: who.get(note.author_id) ?? UNKNOWN,
    encounter: encounter && { id: encounter.id, foundAt: encounter.found_at, foundVia: encounter.found_via, seenAt: encounter.seen_at },
    foundBy,
    recipient: note.recipient_id ? who.get(note.recipient_id) ?? null : null,
  };
}

// Orden dentro de una obra: por punto de la obra («al terminar» al final).
export function anchorSortKey(a: MarginAnchor): number {
  if (a.kind === "ratio") return a.ratio;
  if (a.kind === "episode") return a.season * 10_000 + a.episode;
  return Number.MAX_SAFE_INTEGER;
}

export async function getItemMarginNotes(supabase: SupabaseServerClient, viewerId: string,
  itemType: ItemType, itemId: string): Promise<{ found: MarginNoteView[]; mine: MarginNoteView[] }> {
  // RLS deja ver las propias y las abiertas: no hace falta filtrar más.
  const { data: notes, error } = await supabase.from("margin_notes").select(NOTE_COLS)
    .eq("item_type", itemType).eq("item_id", itemId);
  if (error) throw error;
  const rows = (notes ?? []) as NoteRow[];
  if (rows.length === 0) return { found: [], mine: [] };
  const { data: encs, error: encError } = await supabase.from("margin_note_encounters")
    .select("id, note_id, reader_id, found_at, found_via, seen_at").in("note_id", rows.map((n) => n.id));
  if (encError) throw encError;
  const encounters = (encs ?? []) as EncounterRow[];
  const who = await people(supabase, [
    ...rows.map((n) => n.author_id), ...rows.flatMap((n) => (n.recipient_id ? [n.recipient_id] : [])),
    ...encounters.map((e) => e.reader_id),
  ]);
  const found: MarginNoteView[] = [];
  const mine: MarginNoteView[] = [];
  for (const n of rows) {
    if (n.author_id === viewerId) {
      const readers = encounters.filter((e) => e.note_id === n.id)
        .map((e) => ({ encounterId: e.id, reader: who.get(e.reader_id) ?? UNKNOWN }));
      mine.push(view(n, who, null, readers));
    } else {
      const own = encounters.find((e) => e.note_id === n.id && e.reader_id === viewerId) ?? null;
      if (own) found.push(view(n, who, own, null));
    }
  }
  const byAnchor = (a: MarginNoteView, b: MarginNoteView) => anchorSortKey(a.anchor) - anchorSortKey(b.anchor);
  return { found: found.sort(byAnchor), mine: mine.sort(byAnchor) };
}

export async function getMarginReveal(supabase: SupabaseServerClient, viewerId: string,
  itemType: ItemType, itemId: string): Promise<MarginNoteView[]> {
  const { found } = await getItemMarginNotes(supabase, viewerId, itemType, itemId);
  return found.filter((n) => n.encounter && n.encounter.seenAt === null && n.encounter.foundVia !== "retro");
}

export async function getMarginThread(supabase: SupabaseServerClient, viewerId: string,
  encounterId: string): Promise<MarginNoteView | null> {
  const { data: enc, error } = await supabase.from("margin_note_encounters")
    .select("id, note_id, reader_id, found_at, found_via, seen_at").eq("id", encounterId).maybeSingle();
  if (error) throw error;
  if (!enc) return null;
  const { data: note, error: noteError } = await supabase.from("margin_notes").select(NOTE_COLS)
    .eq("id", enc.note_id).maybeSingle();
  if (noteError) throw noteError;
  if (!note) return null;
  const n = note as NoteRow;
  const e = enc as EncounterRow;
  const who = await people(supabase, [n.author_id, e.reader_id]);
  return view(n, who, e, n.author_id === viewerId ? [{ encounterId: e.id, reader: who.get(e.reader_id) ?? UNKNOWN }] : null);
}

const PAGE = 20;

export async function listMarginForNotebook(supabase: SupabaseServerClient, viewerId: string,
  mode: "found" | "mine", page: number): Promise<{ notes: MarginNoteView[]; hasMore: boolean }> {
  const from = (page - 1) * PAGE;
  if (mode === "mine") {
    const { data, error } = await supabase.from("margin_notes").select(NOTE_COLS)
      .eq("author_id", viewerId).order("created_at", { ascending: false }).range(from, from + PAGE);
    if (error) throw error;
    const rows = (data ?? []) as NoteRow[];
    const who = await people(supabase, [viewerId, ...rows.flatMap((n) => (n.recipient_id ? [n.recipient_id] : []))]);
    return { notes: rows.slice(0, PAGE).map((n) => view(n, who, null, null)), hasMore: rows.length > PAGE };
  }
  const { data, error } = await supabase.from("margin_note_encounters")
    .select("id, note_id, reader_id, found_at, found_via, seen_at")
    .eq("reader_id", viewerId).order("found_at", { ascending: false }).range(from, from + PAGE);
  if (error) throw error;
  const encs = (data ?? []) as EncounterRow[];
  if (encs.length === 0) return { notes: [], hasMore: false };
  const { data: notes, error: noteError } = await supabase.from("margin_notes").select(NOTE_COLS)
    .in("id", encs.map((e) => e.note_id));
  if (noteError) throw noteError;
  const byId = new Map(((notes ?? []) as NoteRow[]).map((n) => [n.id, n]));
  const who = await people(supabase, [...byId.values()].map((n) => n.author_id));
  const out = encs.slice(0, PAGE).flatMap((e) => {
    const n = byId.get(e.note_id);
    return n ? [view(n, who, e, null)] : [];
  });
  return { notes: out, hasMore: encs.length > PAGE };
}
