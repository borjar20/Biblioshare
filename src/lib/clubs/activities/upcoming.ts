import { createClient } from "@/lib/supabase/server";
import type { ActivityKind } from "./core";

export type UpcomingCheckpoint = {
  id: string;
  label: string;
  dueOn: string;
  activityId: string;
  activityTitle: string;
  activityKind: ActivityKind;
};

// Los próximos hitos con fecha de las actividades ACTIVAS del club — el
// calendario del feed. Solo miran hacia delante: un hito cuya fecha ya pasó no
// es "próximo", y ensuciaría el bloque.
//
// La RLS de club_activity_checkpoints ya limita a miembros del club; aquí solo
// se filtra por club, estado y fecha.
export async function getUpcomingCheckpoints(
  clubId: string,
  limit = 3,
): Promise<UpcomingCheckpoint[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("club_activity_checkpoints")
    .select(
      "id, label, due_on, activity_id, club_activities!inner(id, title, kind, club_id, status)",
    )
    .eq("club_activities.club_id", clubId)
    .eq("club_activities.status", "active")
    .not("due_on", "is", null)
    .gte("due_on", today)
    .order("due_on", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => {
    // El join !inner llega como objeto, pero postgrest-js lo tipa como array
    // cuando no puede probar la cardinalidad. Normalizamos.
    const activity = (
      Array.isArray(row.club_activities)
        ? row.club_activities[0]
        : row.club_activities
    ) as { id: string; title: string; kind: ActivityKind };

    return {
      id: row.id,
      label: row.label,
      dueOn: row.due_on as string,
      activityId: activity.id,
      activityTitle: activity.title,
      activityKind: activity.kind,
    };
  });
}
