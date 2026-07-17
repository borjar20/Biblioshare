import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getAnnualGoals } from "@/lib/challenges/annual-goals";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { NowConsuming } from "@/components/now-consuming";
import { WeeklyStrip } from "@/components/stats/weekly-strip";
import { StreakCard } from "@/components/stats/streak-card";
import { BookGoalCard } from "@/components/stats/book-goal-card";
import { GoalRows } from "@/components/stats/goal-rows";
import { DailyGoalForm } from "@/components/stats/daily-goal-form";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { todayISO } from "@/lib/stats/dates";

const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Estadísticas ◍ — la mitad cuantitativa del antiguo Panel (frames B y G).
// Privada: la página ya garantiza que solo llega aquí el dueño.
export async function StatsTab({
  userId,
  monthParam,
}: {
  userId: string;
  monthParam?: string;
}) {
  const t = await getTranslations("profile");
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const ownProfile = await getOwnProfile(supabase, userId);

  const [inProgress, weekly, streaks, calendar, annual, annualGoals] =
    await Promise.all([
      getLibraryItems(supabase, userId, { status: "in_progress" }),
      getWeeklyActivity(supabase, userId),
      getStreaks(supabase, userId),
      getMonthCalendar(
        supabase,
        userId,
        MONTH_RE.test(monthParam ?? "") ? (monthParam as string) : currentMonthKey(),
      ),
      getAnnualCompleted(supabase, userId, year),
      getAnnualGoals(supabase, userId, year),
    ]);

  return (
    <div className="grid gap-6">
      <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/5 px-3 py-2 text-[11px] text-muted-foreground">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        {t("panelPrivateNote")}
      </p>

      <NowConsuming items={inProgress} linkToSession variant="strip" />

      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        <WeeklyStrip
          days={weekly}
          dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <StreakCard streaks={streaks} />
        </div>
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <BookGoalCard completed={annual.byType.book} goal={annualGoals.book} />
        </div>
      </div>

      <div className="grid gap-4 rounded-card border border-border bg-surface shadow-card p-4">
        <GoalRows annual={annual} annualGoals={annualGoals} />
        <div className="border-t border-border" />
        <DailyGoalForm dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null} />
      </div>

      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        {/* basePath es la base de la API (`${basePath}api/month-calendar`),
            no una ruta de página — se queda en "/". */}
        <MonthCalendar
          initialCalendar={calendar}
          basePath="/"
          todayKey={todayISO()}
        />
      </div>
    </div>
  );
}
