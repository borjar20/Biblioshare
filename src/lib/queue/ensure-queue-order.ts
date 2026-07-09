import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Keeps a dense 0..N-1 queue_order across the user's "planned" items, so
// getQueueItems can always trust the ordering is gap-free. New/re-planned
// items (queue_order null) fall to the end, most-recently-updated first.
// Lazy, guarded, cheap no-op when already dense — same "read, write only if
// needed" pattern as ensureItemEnriched (src/lib/people/enrich-item.ts).
// See docs/REQUIREMENTS.md §7.22.
export async function ensureQueueOrder(
  supabase: SupabaseServerClient,
  userId: string
): Promise<void> {
  const { data: entries, error } = await supabase
    .from("library_entries")
    .select("id, queue_order")
    .eq("user_id", userId)
    .eq("status", "planned")
    .order("queue_order", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!entries || entries.length === 0) return;

  const isDense = entries.every((entry, index) => entry.queue_order === index);
  if (isDense) return;

  await Promise.all(
    entries.map((entry, index) =>
      supabase
        .from("library_entries")
        .update({ queue_order: index })
        .eq("id", entry.id)
        .eq("user_id", userId)
    )
  );
}
