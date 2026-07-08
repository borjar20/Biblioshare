import type { createClient } from "@/lib/supabase/server";
import type { AnnualCompleted, MonthlyCompleted } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Items completed per month of `year`, counted from diary_entries.finished_on
// (all item types, including movies — a movie has no session but a finish).
export async function getAnnualCompleted(
  supabase: SupabaseServerClient,
  userId: string,
  year: number
): Promise<AnnualCompleted> {
  const months: MonthlyCompleted[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ month: `${year}-${String(m).padStart(2, "0")}`, count: 0 });
  }

  const { data, error } = await supabase
    .from("diary_entries")
    .select("finished_on")
    .eq("user_id", userId)
    .gte("finished_on", `${year}-01-01`)
    .lte("finished_on", `${year}-12-31`);

  if (error) throw error;

  const byMonth = new Map(months.map((m) => [m.month, m]));
  let total = 0;
  for (const row of data ?? []) {
    const bucket = byMonth.get(row.finished_on.slice(0, 7));
    if (bucket) {
      bucket.count += 1;
      total += 1;
    }
  }

  return { year, months, total };
}
