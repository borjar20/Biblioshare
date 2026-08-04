import type { createClient } from "@/lib/supabase/server";
import { type StatsPeriod, yearBounds } from "./period";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HoursByMonth = {
  // El año que se está pintando (para el título). "Todo" no tiene 12 meses
  // propios, así que cae en el año en curso.
  year: number;
  // 12 meses (enero→diciembre) con los minutos sumados de las sesiones.
  months: { month: number; minutes: number }[];
};

// Minutos de lectura por mes del año (frame J, "Horas por mes"). Suma
// `duration_minutes` de las sesiones por mes natural. Como el gráfico son 12
// meses de un año concreto, "Todo" se pinta sobre el año en curso.
export async function getHoursByMonth(
  supabase: SupabaseServerClient,
  userId: string,
  period: StatsPeriod = "all",
): Promise<HoursByMonth> {
  // El panel son 12 meses de UN año: los períodos cortos (semana, mes) y
  // «todo» no tienen doce meses propios, así que caen en el año en curso. El
  // rótulo del panel dice qué año se está pintando, no el período elegido.
  const year = typeof period === "number" ? period : new Date().getFullYear();
  const { start, endExclusive } = yearBounds(year);

  const { data, error } = await supabase
    .from("progress_sessions")
    .select("session_date, duration_minutes")
    .eq("user_id", userId)
    .gte("session_date", start)
    .lt("session_date", endExclusive);

  if (error) throw error;

  const minutes = new Array(12).fill(0);
  for (const row of (data ?? []) as {
    session_date: string;
    duration_minutes: number | null;
  }[]) {
    const monthIndex = Number(row.session_date.slice(5, 7)) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      minutes[monthIndex] += row.duration_minutes ?? 0;
    }
  }

  return {
    year,
    months: minutes.map((m, i) => ({ month: i + 1, minutes: m })),
  };
}
