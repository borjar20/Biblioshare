import type { createClient } from "@/lib/supabase/server";
import { todayISO } from "./dates";
import { bestStreak, currentStreak } from "./streak";
import type { Streaks } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Current and best run of consecutive days with at least one activity.
//
// "Activity" is deliberately broader than the weekly strip's reading minutes
// (§7.14): a day counts if you logged a session of ANY type, or finished an
// item. Otherwise a movie night — which records a diary entry and no session —
// would break a streak. Fetches only the date columns (cheap), computes in JS.
export async function getStreaks(
  supabase: SupabaseServerClient,
  userId: string
): Promise<Streaks> {
  const [sessions, finished] = await Promise.all([
    supabase.from("progress_sessions").select("session_date").eq("user_id", userId),
    // Un pase abierto todavía no ha terminado nada ese día: no cuenta para
    // la racha.
    supabase
      .from("passes")
      .select("finished_on")
      .eq("user_id", userId)
      .not("finished_on", "is", null),
  ]);

  if (sessions.error) throw sessions.error;
  if (finished.error) throw finished.error;

  const activeDays = new Set([
    ...(sessions.data ?? []).map((row) => row.session_date),
    // El filtro anterior garantiza finished_on no nulo; se narrowa aquí
    // porque Supabase no infiere el tipo a partir de la query.
    ...(finished.data ?? [])
      .filter((row): row is { finished_on: string } => row.finished_on !== null)
      .map((row) => row.finished_on),
  ]);
  // La regla vive en streak.ts, compartida con la racha POR PASE de la tarjeta
  // de hoy: dos implementaciones acabarían dando números distintos para la
  // misma palabra.
  return {
    current: currentStreak(activeDays, todayISO()),
    best: bestStreak(activeDays),
  };
}
