import type { createClient } from "@/lib/supabase/server";
import type { Challenge, ChallengeCriteria } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type Row = {
  id: string;
  name: string;
  item_type: Challenge["itemType"];
  target_count: number;
  criteria: unknown;
  start_date: string;
  end_date: string;
  archived_at: string | null;
};

// criteria is app-defined jsonb (§7.10); read it defensively — a hand-edited or
// future-shaped row shouldn't crash the page, just fall back to "no filter".
function parseCriteria(raw: unknown): ChallengeCriteria {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const criteria: ChallengeCriteria = {};
  if (typeof obj.genre === "string" && obj.genre) criteria.genre = obj.genre;
  if (typeof obj.sagaId === "string" && obj.sagaId) criteria.sagaId = obj.sagaId;
  return criteria;
}

function toChallenge(row: Row): Challenge {
  return {
    id: row.id,
    name: row.name,
    itemType: row.item_type,
    targetCount: row.target_count,
    criteria: parseCriteria(row.criteria),
    startDate: row.start_date,
    endDate: row.end_date,
    archivedAt: row.archived_at,
  };
}

// The user's challenges. By default only the active (non-archived) ones, newest
// first; pass includeArchived to also return past ones. RLS scopes to owner.
export async function getChallenges(
  supabase: SupabaseServerClient,
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {}
): Promise<Challenge[]> {
  let query = supabase
    .from("challenges")
    .select(
      "id, name, item_type, target_count, criteria, start_date, end_date, archived_at"
    )
    .eq("user_id", userId);

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => toChallenge(row as Row));
}
