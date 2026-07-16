import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { AnnualCompleted, MonthlyCompleted } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Items completed per month of `year`, counted from diary_entries.finished_on
// (all item types, including movies — a movie has no session but a finish).
// item_type ya es una columna propia del pase (§Tarea 9): sin join a
// library_entries, la misma lectura alimenta el gráfico combinado y los
// objetivos anuales por tipo (§7.14).
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
    .from("passes")
    .select("finished_on, item_type")
    .eq("user_id", userId)
    .gte("finished_on", `${year}-01-01`)
    .lte("finished_on", `${year}-12-31`);

  if (error) throw error;

  const byMonth = new Map(months.map((m) => [m.month, m]));
  const byType: Record<ItemType, number> = { book: 0, movie: 0, series: 0 };
  let total = 0;
  for (const row of data ?? []) {
    // finished_on no es null: la condición .gte/.lte de arriba lo garantiza
    // en runtime (Supabase no lo infiere de la query).
    const bucket = byMonth.get((row.finished_on as string).slice(0, 7));
    if (bucket) {
      bucket.count += 1;
      byType[row.item_type] += 1;
      total += 1;
    }
  }

  return { year, months, total, byType };
}
