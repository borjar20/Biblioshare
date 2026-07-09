import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Position } from "@/lib/library/position";
import type { ImportRow, ImportRowResult } from "./types";
import { matchImportRow } from "./match-row";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const TABLE_BY_TYPE = {
  book: "books",
  movie: "movies",
  series: "series",
} as const;

type EntryResult =
  | { libraryEntryId: string; isNew: boolean }
  | { error: string };

// Same idiom as add-existing-item.ts/buscar/actions.ts: a unique-violation on
// insert means the row is already in the user's library, not a real error —
// look up its id instead so re-importing the same file stays idempotent.
async function ensureLibraryEntry(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
  row: ImportRow
): Promise<EntryResult> {
  const position: Position = row.bookFormat ? { format: row.bookFormat } : {};

  const { data: inserted, error } = await supabase
    .from("library_entries")
    .insert({
      user_id: userId,
      item_type: itemType,
      item_id: itemId,
      status: row.status,
      rating: row.rating,
      position,
    })
    .select("id")
    .single();

  if (!error) return { libraryEntryId: inserted.id, isNew: true };

  if (error.code === "23505") {
    const { data: existing } = await supabase
      .from("library_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .single();
    if (existing) return { libraryEntryId: existing.id, isNew: false };
  }

  return { error: error.message };
}

// One diary_entries row per CSV row with a date, skipping ones that already
// exist (no unique DB constraint on library_entry_id+finished_on, so this is
// checked at the application level) — keeps re-imports from duplicating
// reread/rewatch history.
async function addMissingDiaryEntries(
  supabase: SupabaseServerClient,
  userId: string,
  libraryEntryId: string,
  row: ImportRow
) {
  for (const date of row.diaryDates) {
    const { data: existing } = await supabase
      .from("diary_entries")
      .select("id")
      .eq("library_entry_id", libraryEntryId)
      .eq("finished_on", date.finishedOn)
      .maybeSingle();
    if (existing) continue;

    await supabase.from("diary_entries").insert({
      library_entry_id: libraryEntryId,
      user_id: userId,
      started_on: date.startedOn,
      finished_on: date.finishedOn,
      rating: row.rating,
    });
  }
}

export async function commitImportRow(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  row: ImportRow
): Promise<ImportRowResult> {
  try {
    const catalogId = await matchImportRow(supabase, itemType, row);
    if (!catalogId) {
      return { rowNumber: row.rowNumber, title: row.title, outcome: "unmatched" };
    }

    const entryResult = await ensureLibraryEntry(supabase, userId, itemType, catalogId, row);
    if ("error" in entryResult) {
      return {
        rowNumber: row.rowNumber,
        title: row.title,
        outcome: "error",
        errorMessage: entryResult.error,
      };
    }

    await addMissingDiaryEntries(supabase, userId, entryResult.libraryEntryId, row);

    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: entryResult.isNew ? "imported" : "duplicate",
      unknownStatus: row.unknownStatusLabel ?? undefined,
    };
  } catch (err) {
    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: "error",
      errorMessage: err instanceof Error ? err.message : "unknown error",
    };
  }
}

// Used by the "add manually" affordance on unmatched rows — same insert
// shape as src/app/buscar/manual/actions.ts's addManualItem, just invoked
// inline instead of through a page redirect, and reusing this module's
// library_entries/diary_entries commit logic.
export async function commitManualImportRow(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  row: ImportRow,
  overrides: { title: string; author: string | null; year: number | null }
): Promise<ImportRowResult> {
  const table = TABLE_BY_TYPE[itemType];
  const payload =
    itemType === "book"
      ? {
          title: overrides.title,
          author: overrides.author,
          published_year: overrides.year,
          publisher: row.publisher,
          total_pages: row.pageCount,
          isbn: row.isbn,
        }
      : itemType === "movie"
        ? { title: overrides.title, director: overrides.author, release_year: overrides.year }
        : { title: overrides.title, creator: overrides.author, release_year: overrides.year };

  const { data: inserted, error } = await supabase
    .from(table)
    .insert(payload as never)
    .select("id")
    .single();

  if (error) {
    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: "error",
      errorMessage: error.message,
    };
  }

  const entryResult = await ensureLibraryEntry(supabase, userId, itemType, inserted.id, row);
  if ("error" in entryResult) {
    return {
      rowNumber: row.rowNumber,
      title: row.title,
      outcome: "error",
      errorMessage: entryResult.error,
    };
  }

  await addMissingDiaryEntries(supabase, userId, entryResult.libraryEntryId, row);

  return {
    rowNumber: row.rowNumber,
    title: row.title,
    outcome: entryResult.isNew ? "imported" : "duplicate",
  };
}
