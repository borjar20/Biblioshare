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
import { buildProfilePanels } from "@/lib/stats/panel/specs";
import { StatPanel } from "@/components/stats/panel/stat-panel";
import { DailyGoalForm } from "@/components/stats/daily-goal-form";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { todayISO } from "@/lib/stats/dates";

const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Marco para lo que NO es un panel de datos: el calendario y el editor de
// objetivo, que son controles con estado propio.
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
//
// Desde el rediseño de paneles accesibles, las tarjetas de datos son
// `PanelSpec` pintadas por el armazón común (`StatPanel`), igual que
// `/estadisticas`: mismo contrato, mismo microcopy y —lo que más importa— los
// mismos números contados igual en los dos sitios, porque cuatro de los
// constructores son literalmente los del muro. Ver
// docs/design/paneles-estadisticos.md.
//
// Siguen fuera del armazón el calendario mensual y el editor de objetivo: no son
// paneles de lectura, son controles con estado propio.
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

  const [weekly, streaks, calendar, monthly, rating, records, tbr, habits, pace] =
    await Promise.all([
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

  const [
    semana,
    objetivoHoy,
    racha,
    ritmo,
    actividadAnual,
    valoracion,
    recordsSpec,
    pila,
    habitos,
  ] = buildProfilePanels({
    titles: {
      weekly: tStats("weeklyTitle"),
      dailyGoal: tStats("dailyGoalTitle"),
      streak: tStats("streakTitle"),
      pace: tStats("paceTitle"),
      activityYear: tProfile("activityYearTitle"),
      rating: tStats("ratingTitle"),
      records: tStats("recordsTitle"),
      tbr: tStats("tbrTitle"),
      habits: tStats("habitsTitle"),
    },
    weekly,
    monthly,
    dailyGoalMinutes: ownProfile?.dailyGoalMinutes ?? null,
    streaks,
    pagesPerDay: pace,
    rating,
    records,
    tbr,
    habits,
  });

  const privNote = (
    <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/5 px-3 py-2 text-[11px] text-muted-foreground">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      {tProfile("panelPrivateNote")}
    </p>
  );

  // Dos pilas independientes: en escritorio el muro (izquierda, 1fr) y el rail
  // (derecha, 340px); en móvil se apilan, rail primero (orden del frame B). Cada
  // tarjeta se pinta UNA vez — el calendario y el editor diario llevan estado y
  // duplicarlos rompería la regla de los dos árboles.
  const rail = (
    <div className="flex flex-col gap-4">
      {privNote}
      <StatPanel spec={semana} />
      <StatPanel spec={objetivoHoy} />
      <Card>
        <DailyGoalForm dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null} />
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <StatPanel spec={racha} />
        <StatPanel spec={ritmo} />
      </div>
      <Card>
        <MonthCalendar initialCalendar={calendar} basePath="/" todayKey={todayISO()} />
      </Card>
      <StatPanel spec={habitos} />
    </div>
  );

  const main = (
    <div className="flex flex-col gap-4">
      <StatPanel spec={valoracion} />
      {/* Actividad anual: solo en escritorio (frame G; el móvil B no la trae). */}
      <div className="hidden lg:block">
        <StatPanel spec={actividadAnual} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatPanel spec={recordsSpec} />
        <StatPanel spec={pila} />
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start">
      <div className="lg:order-2">{rail}</div>
      <div className="lg:order-1">{main}</div>
    </div>
  );
}
