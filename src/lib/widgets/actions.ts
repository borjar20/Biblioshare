"use server";

import { createClient } from "@/lib/supabase/server";
import { getTodayFocus } from "@/lib/stats/get-today-focus";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { todayISO } from "@/lib/stats/dates";
import { buildWidgetSnapshot } from "./build-widget-snapshot";
import type { WidgetSnapshot } from "./types";

// Server action que construye el snapshot para los widgets Android REUTILIZANDO
// las mismas lecturas que el dashboard: getTodayFocus (destacado), la última
// casilla de getWeeklyActivity (minutos de hoy), getStreaks (racha global) y
// profiles.daily_goal_minutes. El widget nunca habla con Supabase: habla con
// esto a través del WebView, con la sesión de cookies de la propia app.
//
// Resultado discriminado, nunca throw: Next.js redacta el message de los
// errores de server action en producción (ver memoria del repo), así que un
// catch del cliente no podría distinguir nada.

export type WidgetSnapshotResult =
  | { ok: true; snapshot: WidgetSnapshot }
  | { ok: false; reason: "unauthenticated" | "error" };

export async function getWidgetSnapshot(): Promise<WidgetSnapshotResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "unauthenticated" };

    const [focus, weekly, streaks, profile] = await Promise.all([
      getTodayFocus(supabase, user.id),
      getWeeklyActivity(supabase, user.id),
      getStreaks(supabase, user.id),
      supabase
        .from("profiles")
        .select("daily_goal_minutes")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const passes = [focus.featured, ...focus.rest].filter(
      (p): p is NonNullable<typeof p> => p !== null,
    );

    return {
      ok: true,
      snapshot: buildWidgetSnapshot({
        userId: user.id,
        passes,
        total: focus.total,
        date: todayISO(),
        goalMinutes: profile.data?.daily_goal_minutes ?? null,
        todayMinutes: weekly[weekly.length - 1]?.minutes ?? 0,
        streak: streaks.current,
      }),
    };
  } catch (e) {
    console.error("widgets: getWidgetSnapshot failed", e);
    return { ok: false, reason: "error" };
  }
}
