import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/database.types";
import {
  parseEventConfig,
  type FechaDestacadaConfig,
  type LanzamientoConfig,
} from "@/lib/clubs/activities/event-types";

type EventTraceRow = { kind: string; event_type: string; config: Json | null };
const PAGE = 1000;

function bookReferences(row: EventTraceRow): string[] {
  if (row.kind !== "evento") return [];
  if (row.event_type === "lanzamiento") {
    const { item } = parseEventConfig("lanzamiento", row.config) as LanzamientoConfig;
    return item?.itemType === "book" ? [item.itemId] : [];
  }
  if (row.event_type === "fecha_destacada") {
    const { relations } = parseEventConfig("fecha_destacada", row.config) as FechaDestacadaConfig;
    return relations.flatMap((relation) =>
      relation.kind === "item" && relation.itemType === "book" ? [relation.itemId] : [],
    );
  }
  return [];
}

/** User-authored event references contribute to the merge winner, like typed references. */
export async function countBookEventTrace(supabase: SupabaseClient): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("club_activities")
      .select("id,kind,event_type,config")
      .eq("kind", "evento")
      .in("event_type", ["lanzamiento", "fecha_destacada"])
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`club_activities: ${error.message}`);
    const rows = (data ?? []) as EventTraceRow[];
    for (const row of rows) {
      for (const id of bookReferences(row)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (rows.length < PAGE) return counts;
  }
}
