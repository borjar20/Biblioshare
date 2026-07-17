import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type Habits = {
  // Franja favorita como banda de 2 h [startHour, startHour+2). null si no hay
  // ninguna sesión con hora de inicio (started_at).
  favoriteBand: { startHour: number } | null;
  // Día de la semana más lector, 0 = lunes … 6 = domingo. null sin datos.
  favoriteWeekday: number | null;
  // Duración media de sesión en minutos (solo sesiones con duración). null sin
  // datos.
  averageMinutes: number | null;
};

export type HabitRow = {
  session_date: string;
  duration_minutes: number | null;
  started_at: string | null;
};

// Cálculo puro (testable) de "Cuándo lees" a partir de las sesiones. La franja
// se saca de started_at (la hora real de inicio, P8); las filas sin ella no
// cuentan para la franja, pero sí para día y sesión media.
export function computeHabits(rows: HabitRow[]): Habits {
  // Franja: 12 bandas de 2 h (0-2, 2-4, … 22-24).
  const bands = new Array(12).fill(0);
  for (const row of rows) {
    if (!row.started_at) continue;
    const d = new Date(row.started_at);
    if (Number.isNaN(d.getTime())) continue;
    bands[Math.floor(d.getUTCHours() / 2)]++;
  }
  const favoriteBand = peakIndex(bands);

  // Día de la semana (lunes=0). session_date es YYYY-MM-DD.
  const weekdays = new Array(7).fill(0);
  for (const row of rows) {
    const d = new Date(`${row.session_date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    weekdays[(d.getUTCDay() + 6) % 7]++;
  }
  const favoriteWeekday = peakIndex(weekdays);

  // Sesión media (minutos), solo sesiones con duración > 0.
  const durations = rows
    .map((r) => r.duration_minutes)
    .filter((m): m is number => m != null && m > 0);
  const averageMinutes =
    durations.length > 0
      ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length)
      : null;

  return {
    favoriteBand: favoriteBand === null ? null : { startHour: favoriteBand * 2 },
    favoriteWeekday,
    averageMinutes,
  };
}

// Índice del máximo, o null si todo es 0.
function peakIndex(counts: number[]): number | null {
  let best = -1;
  let bestCount = 0;
  counts.forEach((c, i) => {
    if (c > bestCount) {
      bestCount = c;
      best = i;
    }
  });
  return best === -1 ? null : best;
}

export async function getHabits(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Habits> {
  const { data, error } = await supabase
    .from("progress_sessions")
    .select("session_date, duration_minutes, started_at")
    .eq("user_id", userId);

  if (error) throw error;
  return computeHabits((data ?? []) as HabitRow[]);
}
