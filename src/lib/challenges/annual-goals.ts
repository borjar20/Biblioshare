import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const EMPTY: Record<ItemType, number | null> = {
  book: null,
  movie: null,
  series: null,
};

// La meta anual por tipo, derivada de los RETOS (plan 05, P6): tras la fusión
// ya no hay columnas `annual_goal_*` — la meta de un tipo ES un reto de ese
// tipo que cubre el año natural sin criterio de género/saga. Si hay varios,
// gana el objetivo más alto. La usan el rail de Inicio y la pestaña
// Estadísticas para seguir pintando "Meta libros" / "Objetivos" igual que
// antes, solo que ahora leyendo del modelo único.
export async function getAnnualGoals(
  supabase: SupabaseServerClient,
  userId: string,
  year: number,
): Promise<Record<ItemType, number | null>> {
  const { data, error } = await supabase
    .from("challenges")
    .select("item_type, target_count, criteria, start_date, end_date")
    .eq("user_id", userId)
    .is("archived_at", null)
    .not("item_type", "is", null)
    .lte("start_date", `${year}-01-01`)
    .gte("end_date", `${year}-12-31`);

  if (error) throw error;

  const goals: Record<ItemType, number | null> = { ...EMPTY };
  for (const row of data ?? []) {
    // Un reto con filtro de género o saga no es la meta llana del tipo.
    const c = row.criteria;
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const obj = c as Record<string, unknown>;
      if (obj.genre || obj.sagaId) continue;
    }
    const type = row.item_type as ItemType | null;
    if (!type) continue;
    const current = goals[type];
    if (current == null || row.target_count > current) {
      goals[type] = row.target_count;
    }
  }
  return goals;
}
