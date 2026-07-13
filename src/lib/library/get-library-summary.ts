import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LibrarySummary = {
  total: number;
  byStatus: Record<MediaStatus, number>;
  byType: Record<ItemType, number>;
};

// Resumen de la colección (barra apilada por estado + recuento por tipo). Una
// sola lectura: getLibraryStats ya contaba por tipo, pero no por estado, y
// pedir las dos cosas por separado sería una query de más.
export async function getLibrarySummary(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<LibrarySummary> {
  const { data, error } = await supabase
    .from("library_entries")
    .select("item_type, status")
    .eq("user_id", userId);

  if (error) throw error;

  const summary: LibrarySummary = {
    total: 0,
    byStatus: { planned: 0, in_progress: 0, completed: 0, dropped: 0 },
    byType: { book: 0, movie: 0, series: 0 },
  };

  for (const row of data ?? []) {
    summary.total += 1;
    summary.byStatus[row.status as MediaStatus] += 1;
    summary.byType[row.item_type as ItemType] += 1;
  }

  return summary;
}
