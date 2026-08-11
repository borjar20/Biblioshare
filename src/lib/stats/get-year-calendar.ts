// Calendario anual (§2 del esquema): un año entero de actividad, día a día.
// Es el mismo criterio de «día activo» que usan las rachas —una sesión de
// cualquier tipo, o algo terminado—, no solo minutos de lectura: si no, una
// noche de cine dejaría el día en blanco.
//
// A diferencia del calendario mensual, aquí NO se hidratan portadas: son 365
// celdas y ninguna tiene sitio para una imagen. El detalle de un día vive en el
// calendario del mes.

import type { createClient } from "@/lib/supabase/server";
import { yearBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type YearCalendar = {
  year: number;
  /** Un elemento por día del año, en orden. `count` = actividades del día. */
  days: { date: string; count: number }[];
  activeDays: number;
  busiest: { date: string; count: number } | null;
};

export async function getYearCalendar(
  supabase: SupabaseServerClient,
  userId: string,
  year: number,
): Promise<YearCalendar> {
  const { start, endExclusive } = yearBounds(year);

  const [sessions, finished] = await Promise.all([
    supabase
      .from("progress_sessions")
      .select("session_date")
      .eq("user_id", userId)
      .gte("session_date", start)
      .lt("session_date", endExclusive),
    supabase
      .from("passes")
      .select("finished_on")
      .eq("user_id", userId)
      .not("finished_on", "is", null)
      .gte("finished_on", start)
      .lt("finished_on", endExclusive),
  ]);

  if (sessions.error) throw sessions.error;
  if (finished.error) throw finished.error;

  const counts = new Map<string, number>();
  const bump = (date: string) => counts.set(date, (counts.get(date) ?? 0) + 1);
  for (const row of sessions.data ?? []) bump(row.session_date);
  for (const row of finished.data ?? []) {
    if (row.finished_on) bump(row.finished_on);
  }

  const days: YearCalendar["days"] = [];
  let busiest: YearCalendar["busiest"] = null;
  let activeDays = 0;
  for (let month = 1; month <= 12; month++) {
    const total = new Date(year, month, 0).getDate();
    for (let day = 1; day <= total; day++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const count = counts.get(date) ?? 0;
      days.push({ date, count });
      if (count > 0) activeDays++;
      if (!busiest || count > busiest.count) busiest = { date, count };
    }
  }

  return { year, days, activeDays, busiest: busiest && busiest.count > 0 ? busiest : null };
}
