import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { todayISO } from "@/lib/stats/dates";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getCelebrationKey, reachedMilestone } from "./registry";
import type { CelebrationPayload } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// "Ganar" una celebración = insertarla si el usuario no la tenía ya. La
// restricción UNIQUE(user_id, event_type, event_key) es la deduplicación: ganar
// dos veces el mismo hito no crea una segunda fila. Por eso NO hace falta
// detectar "¿es la primera vez?" — se gana siempre y la BD deduplica.
//
// Best-effort a propósito, como los fan-outs de notificaciones: si falla, la
// escritura de dominio que la disparó ya está hecha y no se deshace por esto.
// NUNCA lanza: un error aquí no puede tumbar el registro de una sesión.
export async function earnCelebration(
  supabase: SupabaseServerClient,
  userId: string,
  payload: CelebrationPayload,
): Promise<void> {
  try {
    const eventKey = getCelebrationKey(payload);
    const { error } = await supabase.from("user_celebrations").upsert(
      {
        user_id: userId,
        event_type: payload.event,
        event_key: eventKey,
        payload: payload as unknown as Json,
      },
      { onConflict: "user_id,event_type,event_key", ignoreDuplicates: true },
    );
    if (error) console.error("earnCelebration", payload.event, error);
  } catch (e) {
    console.error("earnCelebration threw", e);
  }
}

// Detector del bucle diario: cubre TRES eventos desde un único punto, porque los
// tres nacen de "has registrado actividad hoy" — una sesión de lectura, un
// episodio visto, un pase cerrado. Lo llaman addSession y las escrituras de
// episodios tras un guardado con éxito.
export async function earnDailyLoopCelebrations(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const today = todayISO();

  // 1) Primera actividad del día. Se gana en cada actividad; la clave del día la
  //    deduplica, así que solo la primera cuenta.
  await earnCelebration(supabase, userId, {
    event: "first_activity_of_day",
    date: today,
  });

  const [goalRow, streaks] = await Promise.all([
    supabase
      .from("profiles")
      .select("daily_goal_minutes")
      .eq("user_id", userId)
      .maybeSingle(),
    getStreaks(supabase, userId),
  ]);

  // 2) Objetivo diario: solo se gana cuando los minutos de HOY ya llegan a la
  //    meta. Ganar solo-cuando-cumplido + dedup por día = se muestra una vez, la
  //    primera que se cumple. Los minutos son de lectura (§7.14): una serie no
  //    aporta minutos y por eso no dispara este evento (pero sí los otros dos).
  const goal = goalRow.data?.daily_goal_minutes ?? null;
  if (goal && goal > 0) {
    const { data: sessions } = await supabase
      .from("progress_sessions")
      .select("duration_minutes")
      .eq("user_id", userId)
      .eq("session_date", today);
    const minutes = (sessions ?? []).reduce(
      (sum, row) => sum + (row.duration_minutes ?? 0),
      0,
    );
    if (minutes >= goal) {
      await earnCelebration(supabase, userId, {
        event: "daily_goal_completed",
        date: today,
      });
    }
  }

  // 3) Hito de racha: la racha global (misma definición que Perfil › Panel).
  const milestone = reachedMilestone(streaks.current);
  if (milestone) {
    await earnCelebration(supabase, userId, {
      event: "streak_milestone",
      milestone,
    });
  }
}

// Primera participación significativa en un club: publicar, comentar, votar,
// unirse o registrar progreso. "Una vez por usuario" (clave sin sufijo), así que
// se puede llamar desde CUALQUIER acción de club sin detectar cuál fue la
// primera — la BD deduplica. No se guarda el nombre del club (privacidad): solo
// el id, que no revela contenido.
export async function earnFirstClubParticipation(
  supabase: SupabaseServerClient,
  userId: string,
  clubId?: string,
): Promise<void> {
  await earnCelebration(supabase, userId, {
    event: "first_club_participation",
    clubId,
  });
}
