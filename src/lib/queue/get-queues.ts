import type { createClient } from "@/lib/supabase/server";
import type { Queue } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// The user's named queues, in display order (§7.22). RLS already scopes this
// to the owner, so no explicit user_id filter is needed for correctness — it's
// kept for index use and clarity.
export async function getQueues(
  supabase: SupabaseServerClient,
  userId: string
): Promise<Queue[]> {
  const { data, error } = await supabase
    .from("queues")
    .select("id, name, position")
    .eq("user_id", userId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
  }));
}
