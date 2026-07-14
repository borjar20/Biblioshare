import type { createClient } from "@/lib/supabase/server";
import type { Pass } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Pases de una entrada: el abierto primero (finished_on null), luego los
// cerrados de más reciente a más antiguo. Ese orden es el que espera el diario
// para calcular el delta contra el pase anterior.
export async function getPasses(
  supabase: SupabaseServerClient,
  entryId: string
): Promise<Pass[]> {
  const { data } = await supabase
    .from("diary_entries")
    .select("id, started_on, finished_on, rating, review, is_public, edition_id")
    .eq("library_entry_id", entryId)
    .order("finished_on", { ascending: false, nullsFirst: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    startedOn: r.started_on,
    finishedOn: r.finished_on,
    rating: r.rating,
    review: r.review,
    isPublic: r.is_public,
    editionId: r.edition_id,
  }));
}
