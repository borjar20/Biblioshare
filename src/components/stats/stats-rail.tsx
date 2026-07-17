import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getAnnualGoals } from "@/lib/challenges/annual-goals";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { WeeklyStrip } from "./weekly-strip";
import { StreakCard } from "./streak-card";
import { BookGoalCard } from "./book-goal-card";
import { GoalRows } from "./goal-rows";

// La barra lateral del frame B: en escritorio el feed manda, pero sobra ancho,
// así que tus stats viven al lado en vez de obligarte a ir a Perfil.
//
// Es un RESUMEN, no el Panel: sin calendario, sin retos y sin el formulario de
// objetivos — eso sigue siendo de Perfil › Panel, que es la vista completa. No
// se ve por debajo de lg, donde el feed se queda solo (frame A).
//
// SIN "Ahora mismo" (decisión del usuario, 2026-07-17): el bloque de hoy, justo
// encima, ya enseña lo que tienes a medias — y mejor, con progreso y acciones y
// no solo portadas. Era el duplicado literal de juntar dos maquetas de distinta
// época (el frame B es de la IA vieja; el G, posterior).
//
// "Racha" SÍ se queda: la de aquí es la GLOBAL —tus días seguidos, leas lo que
// leas— y la de las tarjetas de hoy es la de CADA PASE. Desde que dejaron de ser
// el mismo número, dicen cosas distintas y las dos aportan.
export async function StatsRail({ userId }: { userId: string }) {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const [profile, weekly, streaks, annual, annualGoals] = await Promise.all([
    getOwnProfile(supabase, userId),
    getWeeklyActivity(supabase, userId),
    getStreaks(supabase, userId),
    getAnnualCompleted(supabase, userId, year),
    getAnnualGoals(supabase, userId, year),
  ]);

  return (
    <div className="grid gap-4">
      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        <WeeklyStrip
          days={weekly}
          dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
          showDailyGoal={false}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <StreakCard streaks={streaks} />
        </div>
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <BookGoalCard completed={annual.byType.book} goal={annualGoals.book} />
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        <GoalRows annual={annual} annualGoals={annualGoals} />
      </div>
    </div>
  );
}
