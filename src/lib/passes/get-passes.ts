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
  // review ya no es una columna legible de diary_entries: se lee de la vista
  // pass_reviews, que además trae la privacidad ya aplicada. Este es el
  // diario propio del usuario (entryId siempre es una entrada suya), así que
  // la vista devuelve tanto sus reseñas públicas como las privadas.
  const { data } = await supabase
    .from("pass_reviews")
    .select("id, started_on, finished_on, rating, review, is_public, edition_id")
    .eq("library_entry_id", entryId)
    .order("finished_on", { ascending: false, nullsFirst: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    startedOn: r.started_on,
    finishedOn: r.finished_on,
    rating: r.rating,
    review: r.review,
    isPublic: r.is_public as boolean,
    editionId: r.edition_id,
  }));
}
