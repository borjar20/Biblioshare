import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "@/lib/library/position";
import type { ProgressSession } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getSessions(
  supabase: SupabaseServerClient,
  libraryEntryId: string,
  itemType: ItemType
): Promise<ProgressSession[]> {
  const { data, error } = await supabase
    .from("progress_sessions")
    .select("id, session_date, duration_minutes, position, note")
    .eq("library_entry_id", libraryEntryId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    durationMinutes: row.duration_minutes,
    position: parsePosition(itemType, row.position),
    note: row.note,
  }));
}
