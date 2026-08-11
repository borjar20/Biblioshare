import type { createClient } from "@/lib/supabase/server";
import type { ItemFilter } from "./filter";
import { type StatsPeriod, periodBounds } from "./period";

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
  // Sesiones registradas, TODAS (con duración o sin ella). No es el divisor de
  // `averageMinutes`: esa media solo promedia las que sí la traen.
  sessions: number;
  // Días distintos con al menos una sesión. Sirve de divisor honesto para
  // «sesiones por día activo» sin contar los días en blanco.
  activeDays: number;
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
    sessions: rows.length,
    activeDays: new Set(rows.map((r) => r.session_date)).size,
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
  period: StatsPeriod = "all",
  itemFilter: ItemFilter = "all",
): Promise<Habits> {
  // El `!inner` solo se pide cuando hace falta: sin filtro, una sesión sin pase
  // (histórico anterior al hub) seguiría contando, y con él desaparecería.
  const columns =
    itemFilter === "all"
      ? "session_date, duration_minutes, started_at"
      : "session_date, duration_minutes, started_at, passes!inner(item_type)";

  let query = supabase
    .from("progress_sessions")
    .select(columns)
    .eq("user_id", userId);

  if (itemFilter !== "all") query = query.eq("passes.item_type", itemFilter);

  const bounds = periodBounds(period);
  if (bounds) {
    query = query
      .gte("session_date", bounds.start)
      .lt("session_date", bounds.endExclusive);
  }

  const { data, error } = await query;

  if (error) throw error;
  // `select()` recibe la lista de columnas como variable, así que Supabase no
  // puede inferir la forma y devuelve su tipo de error de parseo. El doble paso
  // por `unknown` es lo que cuesta poder pedir el join solo cuando hace falta.
  return computeHabits((data ?? []) as unknown as HabitRow[]);
}
