"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ReorderQueueState = {
  error?: "generic";
};

// Full renumber of exactly the ids the client sends (drag-to-any-position
// reordering shifts every item after the drop point, so an append-only
// counter like pinned_order doesn't fit — see docs/REQUIREMENTS.md §7.22).
export async function reorderQueue(orderedEntryIds: string[]): Promise<ReorderQueueState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Defensive re-validation against a stale client (an id whose status
  // changed away from "planned" mid-session shouldn't get a queue_order).
  const { count, error: countError } = await supabase
    .from("library_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "planned")
    .in("id", orderedEntryIds);

  if (countError) return { error: "generic" };
  if ((count ?? 0) !== orderedEntryIds.length) return { error: "generic" };

  const results = await Promise.all(
    orderedEntryIds.map((id, index) =>
      supabase
        .from("library_entries")
        .update({ queue_order: index })
        .eq("id", id)
        .eq("user_id", user.id)
    )
  );

  if (results.some((r) => r.error)) return { error: "generic" };

  revalidatePath("/cola");
  return {};
}
