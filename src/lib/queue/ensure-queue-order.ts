import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type Entry = { id: string; queue_id: string | null; queue_order: number | null };

// Keeps a dense 0..N-1 queue_order across the user's "planned" items *within
// each queue* — including the null "Sin cola" bucket — so getQueueItems can
// always trust the ordering is gap-free per queue. New/re-planned items
// (queue_order null) fall to the end of their queue, most-recently-updated
// first. Lazy, guarded, cheap no-op when already dense — same "read, write only
// if needed" pattern as ensureItemEnriched (src/lib/people/enrich-item.ts).
// See docs/REQUIREMENTS.md §7.22.
export async function ensureQueueOrder(
  supabase: SupabaseServerClient,
  userId: string
): Promise<void> {
  // Pase ACTIVO planned = ítem en cola (§Tarea 9, hub): queue_id/queue_order
  // viven en diary_entries, library_entries ya no se lee ni se escribe.
  const { data: entries, error } = await supabase
    .from("passes")
    .select("id, queue_id, queue_order")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "planned")
    .order("queue_order", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!entries || entries.length === 0) return;

  // Group by queue (the null bucket keyed separately). The outer query's
  // ordering is preserved within each group by insertion order.
  const byQueue = new Map<string, Entry[]>();
  for (const entry of entries as Entry[]) {
    const key = entry.queue_id ?? " null";
    const list = byQueue.get(key) ?? [];
    list.push(entry);
    byQueue.set(key, list);
  }

  const updates: Array<{ id: string; index: number }> = [];
  for (const group of byQueue.values()) {
    group.forEach((entry, index) => {
      if (entry.queue_order !== index) updates.push({ id: entry.id, index });
    });
  }

  if (updates.length === 0) return;

  await Promise.all(
    updates.map(({ id, index }) =>
      supabase
        .from("passes")
        .update({ queue_order: index })
        .eq("id", id)
        .eq("user_id", userId)
    )
  );
}
