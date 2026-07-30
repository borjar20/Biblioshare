import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type BlockState = "none" | "blocked" | "blocked_by";

export async function usersAreBlocked(
  supabase: SupabaseServerClient,
  otherUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("users_are_blocked", {
    other_user_id: otherUserId,
  });
  if (error) throw error;
  return data === true;
}

export async function getBlockState(
  supabase: SupabaseServerClient,
  viewerId: string,
  targetId: string,
): Promise<BlockState> {
  if (viewerId === targetId) return "none";

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${viewerId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${viewerId})`,
    );
  if (error) throw error;

  const row = data?.[0];
  if (!row) return "none";
  return row.blocker_id === viewerId ? "blocked" : "blocked_by";
}

export async function filterUnblockedUserIds(
  supabase: SupabaseServerClient,
  candidateIds: string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(candidateIds)];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase.rpc("filter_unblocked_user_ids", {
    candidate_ids: uniqueIds,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}
