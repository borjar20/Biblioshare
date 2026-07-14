import type { createClient } from "@/lib/supabase/server";
import type { DiaryEntry } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getDiaryEntries(
  supabase: SupabaseServerClient,
  libraryEntryId: string
): Promise<DiaryEntry[]> {
  // review ya no es una columna legible de diary_entries: se lee de la vista
  // pass_reviews (privacidad ya aplicada — ver 20260714_passes_review_privacy.sql).
  const { data, error } = await supabase
    .from("pass_reviews")
    .select("id, started_on, finished_on, rating, review")
    .eq("library_entry_id", libraryEntryId)
    .order("finished_on", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    startedOn: row.started_on,
    finishedOn: row.finished_on,
    rating: row.rating,
    review: row.review,
  }));
}
