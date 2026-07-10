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

  // Renumerado atómico en un solo statement (unnest ... with ordinality en la
  // RPC). Ignora ids que ya no son "planned"/propios en lugar de fallar el
  // lote entero — un cliente obsoleto no bloquea la reordenación del resto.
  const { error } = await supabase.rpc("reorder_queue", {
    entry_ids: orderedEntryIds,
  });

  if (error) return { error: "generic" };

  revalidatePath("/cola");
  return {};
}
