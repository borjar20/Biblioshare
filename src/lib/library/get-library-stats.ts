import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LibraryStats = Record<ItemType, number>;

export async function getLibraryStats(
  supabase: SupabaseServerClient,
  userId: string
): Promise<LibraryStats> {
  // "Entrada de biblioteca" = pase ACTIVO (§Tarea 9, hub): item_type ya vive
  // en diary_entries, library_entries ya no se lee.
  const { data, error } = await supabase
    .from("diary_entries")
    .select("item_type")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw error;

  const stats: LibraryStats = { book: 0, movie: 0, series: 0 };
  for (const row of data ?? []) {
    stats[row.item_type as ItemType] += 1;
  }
  return stats;
}
