import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TbrTrend = {
  // Pendientes ahora mismo (pases activos en "planificado").
  pending: number;
  // Cuánto ha crecido la pila este año: añadidos − terminados.
  netThisYear: number;
  // Últimos meses (más antiguo → más reciente): añadidos vs terminados.
  months: { month: string; added: number; finished: number }[];
};

// Últimos `n` meses acabando en el actual, como claves YYYY-MM.
function recentMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

// "La pila" del muro (frames B/G): cuántos pendientes tienes, cuánto creció la
// pila este año y el flujo añadidos-vs-terminados de los últimos meses. Todo
// desde `passes`. Ver docs/REQUIREMENTS.md §7.14.
export async function getTbrTrend(
  supabase: SupabaseServerClient,
  userId: string,
  monthsBack = 4,
): Promise<TbrTrend> {
  const year = new Date().getFullYear();

  const [{ count: pending, error: pendingError }, flow] = await Promise.all([
    supabase
      .from("passes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("status", "planned"),
    supabase
      .from("passes")
      .select("created_at, finished_on")
      .eq("user_id", userId),
  ]);

  if (pendingError) throw pendingError;
  if (flow.error) throw flow.error;

  const rows = (flow.data ?? []) as {
    created_at: string;
    finished_on: string | null;
  }[];

  const keys = recentMonthKeys(monthsBack);
  const months = new Map(
    keys.map((month) => [month, { month, added: 0, finished: 0 }]),
  );

  let addedThisYear = 0;
  let finishedThisYear = 0;
  for (const row of rows) {
    const addedMonth = row.created_at.slice(0, 7);
    const addedBucket = months.get(addedMonth);
    if (addedBucket) addedBucket.added++;
    if (addedMonth.startsWith(`${year}-`)) addedThisYear++;

    if (row.finished_on) {
      const finishedMonth = row.finished_on.slice(0, 7);
      const finishedBucket = months.get(finishedMonth);
      if (finishedBucket) finishedBucket.finished++;
      if (finishedMonth.startsWith(`${year}-`)) finishedThisYear++;
    }
  }

  return {
    pending: pending ?? 0,
    netThisYear: addedThisYear - finishedThisYear,
    months: keys.map((k) => months.get(k)!),
  };
}
