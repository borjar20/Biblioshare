import { createClient } from "@/lib/supabase/server";
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

// #148: la decisión de "cargarlo todo" sigue en pie, pero tenía un borde sin
// cubrir. PostgREST corta la respuesta en `db-max-rows` (1000 por defecto) y NO
// devuelve error al hacerlo: `.error` sigue siendo null, no hay página
// siguiente, y el calendario simplemente enseñaría menos marcas de las que
// existen. Quien notara "faltan hitos de hace dos años" no tendría ninguna
// pista de que es un límite del servidor y no un bug de buildCalendarMarks.
//
// No se pagina (eso reabriría una decisión de diseño ya tomada y evaluada): se
// pide el count exacto junto con las filas y se compara. Si difieren, el club
// ha cruzado el límite y queda registrado ANTES de que alguien lo reporte.
function avisarSiTruncado(
  tabla: string,
  clubId: string,
  filas: number,
  total: number | null,
): void {
  if (total !== null && filas < total) {
    console.error("getClubCalendarMarks: respuesta truncada por PostgREST", {
      tabla,
      clubId,
      filas,
      total,
    });
  }
}

export async function getClubCalendarMarks(
  clubId: string,
  clubSlug: string,
  today: string,
): Promise<CalendarMark[]> {
  const supabase = await createClient();

  const [actividades, hitos] = await Promise.all([
    supabase
      .from("club_activities")
      .select("id, kind, title, status, starts_on, ends_on", { count: "exact" })
      .eq("club_id", clubId)
      .in("status", ["active", "finished"]),
    supabase
      .from("club_activity_checkpoints")
      .select(
        "id, label, due_on, club_activities!inner(id, title, kind, status)",
        { count: "exact" },
      )
      .eq("club_activities.club_id", clubId)
      .in("club_activities.status", ["active", "finished"])
      .not("due_on", "is", null),
  ]);

  if (actividades.error) throw actividades.error;
  if (hitos.error) throw hitos.error;

  // El count va en la MISMA consulta (cabecera Content-Range), no en un viaje
  // aparte: así no puede desincronizarse con las filas que acaban de llegar.
  avisarSiTruncado("club_activities", clubId, actividades.data?.length ?? 0, actividades.count);
  avisarSiTruncado(
    "club_activity_checkpoints",
    clubId,
    hitos.data?.length ?? 0,
    hitos.count,
  );

  const activityRows: CalendarActivityRow[] = (actividades.data ?? []).map(
    (row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      status: row.status,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
    }),
  );

  const checkpointRows: CalendarCheckpointRow[] = (hitos.data ?? []).map((row) => {
    // El join !inner llega como objeto, pero postgrest-js lo tipa como array
    // cuando no puede probar la cardinalidad. Se normaliza (igual que hacía
    // el antiguo upcoming.ts, ya borrado).
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

  // `today` entra por parámetro, no se lee aquí dentro: la página que consume
  // esta función también necesita "hoy" para agendaForMonth/parseMonthParam
  // (calendar-marks.ts). Si cada función leyera su propio todayISO(), una
  // petición justo a medianoche podría dar dos nociones de "hoy" distintas en
  // la misma respuesta (ya pasó en el antiguo upcoming.ts, ya borrado, con UTC
  // y hora local mezcladas en el mismo fichero).
  return buildCalendarMarks(activityRows, checkpointRows, today, clubSlug);
}
