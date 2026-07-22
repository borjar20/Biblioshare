import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/stats/dates";
import type { ActivityKind } from "./core";
import {
  buildCalendarMarks,
  type CalendarActivityRow,
  type CalendarCheckpointRow,
  type CalendarMark,
} from "./calendar-marks";

// TODAS las marcas del club, sin filtro de rango de fechas. El techo real por
// club son las actividades de toda su vida (decenas) más los hitos, que solo
// tiene buddy_read (~5-10 por lectura): ~300 marcas, ~35 KB. A cambio, navegar
// de mes no cuesta ningún viaje al servidor y no hace falta un índice por
// starts_on (la consulta va por club_id, que ya lo tiene).
//
// La RLS de club_activities y club_activity_checkpoints ya limita a miembros
// del club, así que aquí no hay gate adicional.
export async function getClubCalendarMarks(
  clubId: string,
  clubSlug: string,
): Promise<CalendarMark[]> {
  const supabase = await createClient();

  const [actividades, hitos] = await Promise.all([
    supabase
      .from("club_activities")
      .select("id, kind, title, status, starts_on, ends_on")
      .eq("club_id", clubId)
      .in("status", ["active", "finished"]),
    supabase
      .from("club_activity_checkpoints")
      .select(
        "id, label, due_on, activity_id, club_activities!inner(id, title, kind, club_id, status)",
      )
      .eq("club_activities.club_id", clubId)
      .in("club_activities.status", ["active", "finished"])
      .not("due_on", "is", null),
  ]);

  if (actividades.error) throw actividades.error;
  if (hitos.error) throw hitos.error;

  const activityRows: CalendarActivityRow[] = (actividades.data ?? []).map(
    (row) => ({
      id: row.id,
      kind: row.kind as ActivityKind,
      title: row.title,
      status: row.status as string,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
    }),
  );

  const checkpointRows: CalendarCheckpointRow[] = (hitos.data ?? []).map((row) => {
    // El join !inner llega como objeto, pero postgrest-js lo tipa como array
    // cuando no puede probar la cardinalidad. Se normaliza (igual que hacía
    // upcoming.ts:44-48).
    const activity = (
      Array.isArray(row.club_activities)
        ? row.club_activities[0]
        : row.club_activities
    ) as { id: string; title: string; kind: ActivityKind; status: string };

    return {
      id: row.id,
      label: row.label,
      dueOn: row.due_on as string,
      activityId: activity.id,
      activityTitle: activity.title,
      activityKind: activity.kind,
      activityStatus: activity.status,
    };
  });

  // Una sola lectura de "hoy" para toda la construcción: si se leyera dentro
  // del bucle, una petición a medianoche podría marcar unas fechas como
  // pasadas y otras no.
  return buildCalendarMarks(activityRows, checkpointRows, todayISO(), clubSlug);
}
