import type { createClient } from "@/lib/supabase/server";
import type { MediaStatus } from "@/lib/library/types";
import type { ItemFilter } from "./filter";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type StatusDistribution = {
  // En el orden del frame J: completado, pendiente, en curso, abandonado.
  buckets: { status: MediaStatus; count: number }[];
  total: number;
};

const ORDER: MediaStatus[] = ["completed", "planned", "in_progress", "dropped"];

// Reparto de estados de la biblioteca ACTUAL (frame J). Es una foto, no un flujo:
// cuenta el pase activo de cada obra por su estado, así que ignora el período
// (el selector no lo toca). Ver docs/REQUIREMENTS.md §7.14.
export async function getStatusDistribution(
  supabase: SupabaseServerClient,
  userId: string,
  itemFilter: ItemFilter = "all",
): Promise<StatusDistribution> {
  let query = supabase
    .from("passes")
    .select("status")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (itemFilter !== "all") query = query.eq("item_type", itemFilter);

  const { data, error } = await query;

  if (error) throw error;

  const counts = new Map<MediaStatus, number>(ORDER.map((s) => [s, 0]));
  let total = 0;
  for (const row of (data ?? []) as { status: MediaStatus }[]) {
    if (counts.has(row.status)) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
      total++;
    }
  }

  return {
    buckets: ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })),
    total,
  };
}
