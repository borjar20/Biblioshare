import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type MonthlyActivity = {
  month: string; // "YYYY-MM"
  book: number;
  movie: number;
  series: number;
};

const MONTHS_BACK = 7;

export async function getMonthlyActivity(
  supabase: SupabaseServerClient,
  userId: string
): Promise<MonthlyActivity[]> {
  const now = new Date();
  const months: MonthlyActivity[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      book: 0,
      movie: 0,
      series: 0,
    });
  }
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);

  const { data, error } = await supabase
    .from("diary_entries")
    .select("finished_on, library_entries!inner(item_type, user_id)")
    .eq("library_entries.user_id", userId)
    .gte("finished_on", rangeStart.toISOString().slice(0, 10))
    // Un pase abierto (sin finished_on) todavía no ha terminado nada: no
    // cuenta como actividad del mes.
    .not("finished_on", "is", null);

  if (error) throw error;

  // El filtro anterior garantiza finished_on no nulo; el tipo generado sigue
  // siendo `string | null` porque Supabase no lo infiere de la query.
  const rows = (data ?? []).filter(
    (row): row is typeof row & { finished_on: string } => row.finished_on !== null
  );

  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const row of rows) {
    const month = row.finished_on.slice(0, 7);
    const bucket = byMonth.get(month);
    const itemType = (
      row.library_entries as unknown as { item_type: ItemType } | { item_type: ItemType }[]
    );
    const type = Array.isArray(itemType) ? itemType[0]?.item_type : itemType?.item_type;
    if (bucket && type) bucket[type] += 1;
  }

  return months;
}
