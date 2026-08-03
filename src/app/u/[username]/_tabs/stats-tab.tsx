import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getMonthlyActivity } from "@/lib/diary/get-monthly-activity";
import { getRatingDistribution } from "@/lib/stats/get-rating-distribution";
import { getRecords } from "@/lib/stats/get-records";
import { getTbrSnapshot } from "@/lib/stats/get-tbr-snapshot";
import { getHabits } from "@/lib/stats/get-habits";
import { getPagesPerDay } from "@/lib/stats/get-pace";
import { WeeklyStrip } from "@/components/stats/weekly-strip";
import { StreakCard } from "@/components/stats/streak-card";
import { PaceCard } from "@/components/stats/pace-card";
import { RatingCard } from "@/components/stats/rating-card";
import { RecordsCard } from "@/components/stats/records-card";
import { TbrCard } from "@/components/stats/tbr-card";
import { HabitsCard } from "@/components/stats/habits-card";
import { DailyGoalForm } from "@/components/stats/daily-goal-form";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { ActivityChart } from "@/components/activity-chart";
import { todayISO } from "@/lib/stats/dates";

const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Marco de tarjeta del muro.
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-border bg-surface shadow-card p-4 ${className}`}
    >
      {children}
    </div>
  );
}

// Estadísticas ◍ — el muro del mockup Perfil v2 (frames B móvil y G escritorio).
// Privada: la página ya garantiza que solo llega aquí el dueño.
export async function StatsTab({
  userId,
  monthParam,
}: {
  userId: string;
  monthParam?: string;
}) {
  const tProfile = await getTranslations("profile");
  const tStats = await getTranslations("stats");
  const supabase = await createClient();
  const ownProfile = await getOwnProfile(supabase, userId);

  const [
    weekly,
    streaks,
    calendar,
    monthly,
    rating,
    records,
    tbr,
    habits,
    pace,
  ] = await Promise.all([
    getWeeklyActivity(supabase, userId),
    getStreaks(supabase, userId),
    getMonthCalendar(
      supabase,
      userId,
      MONTH_RE.test(monthParam ?? "") ? (monthParam as string) : currentMonthKey(),
    ),
    getMonthlyActivity(supabase, userId),
    getRatingDistribution(supabase, userId),
    getRecords(supabase, userId),
    getTbrSnapshot(supabase, userId),
    getHabits(supabase, userId),
    getPagesPerDay(supabase, userId),
  ]);

  const privNote = (
    <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/5 px-3 py-2 text-[11px] text-muted-foreground">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      {tProfile("panelPrivateNote")}
    </p>
  );

  // Dos pilas independientes: en escritorio el muro (izquierda, 1fr) y el rail
  // (derecha, 300px); en móvil se apilan, rail primero (orden del frame B). Cada
  // tarjeta se pinta UNA vez — el calendario y el editor diario llevan estado y
  // duplicarlos rompería la regla de los dos árboles.
  const rail = (
    <div className="flex flex-col gap-4">
      {privNote}
      <Card className="grid gap-3">
        <WeeklyStrip
          days={weekly}
          dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null}
        />
        <div className="border-t border-border" />
        <DailyGoalForm dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null} />
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <StreakCard streaks={streaks} />
        </Card>
        <Card>
          <PaceCard pagesPerDay={pace} />
        </Card>
      </div>
      <Card>
        <MonthCalendar initialCalendar={calendar} basePath="/" todayKey={todayISO()} />
      </Card>
      <Card>
        <HabitsCard habits={habits} />
      </Card>
    </div>
  );

  const main = (
    <div className="flex flex-col gap-4">
      <Card>
        <RatingCard dist={rating} />
      </Card>
      {/* Actividad anual: solo en escritorio (frame G; el móvil B no la trae). */}
      <Card className="hidden lg:block">
        <ActivityChart months={monthly} />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <RecordsCard records={records} bestStreakDays={streaks.best} />
        </Card>
        <Card>
          <TbrCard snapshot={tbr} />
        </Card>
      </div>
      <Link
        href="/estadisticas"
        className="self-start text-sm font-medium text-accent hover:underline"
      >
        {tStats("seeFullStats")}
      </Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_300px] lg:items-start">
      <div className="lg:order-2">{rail}</div>
      <div className="lg:order-1">{main}</div>
    </div>
  );
}
