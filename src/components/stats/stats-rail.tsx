import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getAnnualGoals } from "@/lib/challenges/annual-goals";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { getWhoToFollow } from "@/lib/social/get-who-to-follow";
import { deriveRailState } from "@/lib/stats/derive-rail-state";
import { HomeExpandable } from "@/components/home/home-expandable";
import { WeeklyStrip } from "./weekly-strip";
import { StatsWelcome } from "./stats-welcome";
import { StreakCard } from "./streak-card";
import { BookGoalCard } from "./book-goal-card";
import { GoalRows } from "./goal-rows";
import { WhoToFollowCard } from "./who-to-follow-card";

// La barra lateral del frame B: en escritorio el feed manda, pero sobra ancho,
// así que tus stats viven al lado en vez de obligarte a ir a Perfil.
//
// Es un RESUMEN, no el Panel: sin calendario, sin retos y sin el formulario de
// objetivos — eso sigue siendo de Perfil › Panel, que es la vista completa.
// En móvil la tarjeta de Tu semana se contrae para acercar el feed.
//
// SIN "Ahora mismo" (decisión del usuario, 2026-07-17): el bloque de hoy, justo
// encima, ya enseña lo que tienes a medias — y mejor, con progreso y acciones y
// no solo portadas. Era el duplicado literal de juntar dos maquetas de distinta
// época (el frame B es de la IA vieja; el G, posterior).
//
// "Racha" SÍ se queda: la de aquí es la GLOBAL —tus días seguidos, leas lo que
// leas— y la de las tarjetas de hoy es la de CADA PASE. Desde que dejaron de ser
// el mismo número, dicen cosas distintas y las dos aportan.
//
// Móvil/tablet (<1100): las mismas siete barras pasan de miniatura a gráfico
// dentro de Inicio, con el título visible y el resto de actividad debajo. PC
// conserva su columna completa. Una sola tanda de consultas alimenta la vista;
// el guard sin semana evita presentar un gráfico de ceros en el detalle.
export async function StatsRail({ userId }: { userId: string }) {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const panel = await getTranslations("homePanels");
  const tRail = await getTranslations("statsRail");
  const tStats = await getTranslations("stats");
  const [profile, weekly, streaks, annual, annualGoals, whoToFollow] = await Promise.all([
    getOwnProfile(userId),
    getWeeklyActivity(supabase, userId),
    getStreaks(supabase, userId),
    getAnnualCompleted(supabase, userId, year),
    getAnnualGoals(supabase, userId, year),
    getWhoToFollow(supabase, userId),
  ]);

  // Total semanal, con el mismo formato que WeeklyStrip ("2 h 15 m" / "40 min").
  const weekMinutes = weekly.reduce((sum, d) => sum + d.minutes, 0);
  const weekLabel =
    weekMinutes >= 60
      ? tStats("weekTotal", { hours: Math.floor(weekMinutes / 60), minutes: weekMinutes % 60 })
      : tStats("minutesCount", { count: weekMinutes });

  const username = profile?.username ?? "";
  const anyGoalSet =
    annualGoals.book != null || annualGoals.movie != null || annualGoals.series != null;
  const { showWeek, showYear, cold } = deriveRailState({
    weekMinutes,
    annualTotal: annual.total,
    anyGoalSet,
    streakCurrent: streaks.current,
  });
  // Sub-guards del bloque "Tu 2026": ninguna sub-parte lidera con un cero.
  const showBookGoal = annualGoals.book != null || annual.byType.book > 0;
  const showGoalRows = anyGoalSet || annual.total > 0;
  const showStreak = streaks.current > 0 || streaks.best > 0;

  const summaryLabel = cold ? panel("activityStart") : `${weekLabel} · ${tRail("summaryStreak")} ${streaks.current} ${tRail("summaryDays", { count: streaks.current })}`;
  return <HomeExpandable title={panel("stats")} openLabel={panel("openStats")} closeLabel={panel("close")}
    className="home-stats-panel home-stats-morph home-shared-panel"
    summary={<span>{panel("week")} · {summaryLabel}</span>}
    sectionHeading={<h2 className="home-shared-title">{panel("week")}</h2>}
    focus={<div tabIndex={-1} className="home-focus-card home-weekly-focus" data-no-week={!showWeek ? "true" : undefined}>
      <div className="home-weekly-card rounded-card border border-border bg-surface shadow-card p-4">
        <WeeklyStrip days={weekly} dailyGoalMinutes={profile?.dailyGoalMinutes ?? null} showDailyGoal={false} summaryLabel={summaryLabel} />
      </div>
    </div>}>
    <div className="grid gap-4 home-stats-details">

        {cold ? (
          <StatsWelcome username={username} />
        ) : (
          <>
            {showYear && (
              <div className="rounded-card border border-border bg-surface shadow-card p-4">
                <p className="mb-3 font-serif text-[15px] font-semibold">{tRail("year2026")}</p>
                <div className="flex flex-col gap-3">
                  {showBookGoal && (
                    <BookGoalCard completed={annual.byType.book} goal={annualGoals.book} />
                  )}
                  {showGoalRows && <GoalRows annual={annual} annualGoals={annualGoals} />}
                  {showStreak && (
                    <div className={showBookGoal || showGoalRows ? "border-t border-border pt-3" : ""}>
                      <StreakCard streaks={streaks} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <WhoToFollowCard suggestions={whoToFollow} />
    </div>
  </HomeExpandable>;
}
