import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { QueueItem } from "./types";
import { fetchCatalogMeta } from "./fetch-catalog-meta";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Assumes ensureQueueOrder(supabase, userId) already ran this request — a
// dense, gap-free queue_order per "planned" item, within each queue. Pass a
// queueId to fetch one named queue, or null for the "Sin cola" bucket
// (planned items with no queue). See docs/REQUIREMENTS.md §7.22.
export async function getQueueItems(
  supabase: SupabaseServerClient,
  userId: string,
  queueId: string | null
): Promise<QueueItem[]> {
  // Pase ACTIVO planned = ítem en cola (§Tarea 9, hub): item_type/item_id/
  // queue_id/queue_order viven en diary_entries, library_entries ya no se lee.
  let query = supabase
    .from("passes")
    .select("id, item_type, item_id, queue_id, queue_order")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "planned");

  // Postgres treats `= NULL` as never-true, so the empty bucket needs `is`.
  query = queueId === null ? query.is("queue_id", null) : query.eq("queue_id", queueId);

  const { data: entries, error } = await query.order("queue_order", { ascending: true });

  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const entry of entries) idsByType[entry.item_type].push(entry.item_id);

  const metaByKey = await fetchCatalogMeta(supabase, idsByType);

  return entries
    .map((entry) => {
      const meta = metaByKey.get(`${entry.item_type}:${entry.item_id}`);
      if (!meta) return null;
      return {
        entryId: entry.id,
        itemId: entry.item_id,
        itemType: entry.item_type,
        queueId: entry.queue_id,
        queueOrder: entry.queue_order ?? 0,
        ...meta,
      } satisfies QueueItem;
    })
    .filter((item): item is QueueItem => item !== null);
}
