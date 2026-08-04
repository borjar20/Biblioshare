import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getRatingDistribution } from "@/lib/stats/get-rating-distribution";
import { getRecords } from "@/lib/stats/get-records";
import { getTbrSnapshot } from "@/lib/stats/get-tbr-snapshot";
import { getHabits } from "@/lib/stats/get-habits";
import { getPagesPerDay } from "@/lib/stats/get-pace";
import { getPeriodActivity } from "@/lib/stats/get-period-activity";
import { getLibraryHealth } from "@/lib/stats/get-library-health";
import { getFormatStats } from "@/lib/stats/get-format-stats";
import { resolveActivityMetric, resolveItemFilter } from "@/lib/stats/filter";
import { resolvePeriod } from "@/lib/stats/period";
import { buildProfilePanels } from "@/lib/stats/panel/specs";
import { StatPanel } from "@/components/stats/panel/stat-panel";
import { StatsControls } from "@/components/stats/stats-controls";
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

// Estadísticas ◍ — la vista corta del esquema de estadísticas. Privada: la
// página ya garantiza que solo llega aquí el dueño.
//
// Las tarjetas de datos son `PanelSpec` pintadas por el armazón común
// (`StatPanel`), igual que `/estadisticas`: mismo contrato, mismo microcopy y
// —lo que más importa— los mismos números contados igual en los dos sitios,
// porque varios de los constructores son literalmente los del muro. Ver
// docs/design/paneles-estadisticos.md.
//
// SIN RAIL. Antes esto eran dos pilas —muro a la izquierda y un rail de 340 px
// a la derecha— y el reparto no lo decidía el contenido sino el ancho: la
// racha y el ritmo cabían en el rail, así que ahí se quedaban, por delante de
// la actividad del periodo. Ahora es UNA sola secuencia en el orden del
// esquema (qué has hecho · objetivo · hábito · pila · valoración · récords ·
// cuándo consumes) repartida en columnas por empaquetado, no por jerarquía.
//
// Siguen fuera del armazón el calendario mensual y el editor de objetivo: no
// son paneles de lectura, son controles con estado propio.
export async function StatsTab({
  userId,
  basePath,
  monthParam,
  periodParam,
  typeParam,
  metricParam,
}: {
  userId: string;
  basePath: string;
  monthParam?: string;
  periodParam?: string;
  typeParam?: string;
  metricParam?: string;
}) {
  const tProfile = await getTranslations("profile");
  const tStats = await getTranslations("stats");
  const supabase = await createClient();

  // La pestaña arranca en «todo el histórico», que es lo que enseñaba antes de
  // tener selector: estrenar el filtro no debe cambiarle los números a nadie.
  const period = resolvePeriod(periodParam, new Date(), "all");
  const itemFilter = resolveItemFilter(typeParam);
  const metric = resolveActivityMetric(metricParam);
  const month = MONTH_RE.test(monthParam ?? "") ? (monthParam as string) : currentMonthKey();

  const [
    ownProfile,
    activity,
    weekly,
    streaks,
    calendar,
    rating,
    records,
    tbr,
    habits,
    pace,
    health,
    formats,
  ] = await Promise.all([
    getOwnProfile(supabase, userId),
    getPeriodActivity(supabase, userId, period, itemFilter),
    getWeeklyActivity(supabase, userId),
    getStreaks(supabase, userId),
    getMonthCalendar(supabase, userId, month),
    getRatingDistribution(supabase, userId, period, itemFilter),
    getRecords(supabase, userId, period, itemFilter),
    getTbrSnapshot(supabase, userId, itemFilter),
    getHabits(supabase, userId, period, itemFilter),
    getPagesPerDay(supabase, userId, period),
    getLibraryHealth(supabase, userId, period, itemFilter),
    getFormatStats(supabase, userId, period),
  ]);

  const [
    actividad,
    semana,
    objetivoHoy,
    racha,
    ritmo,
    pila,
    balance,
    valoracion,
    recordsSpec,
    habitos,
  ] = buildProfilePanels({
    period,
    itemFilter,
    metric,
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
    activity,
    weekly,
    dailyGoalMinutes: ownProfile?.dailyGoalMinutes ?? null,
    streaks,
    pagesPerDay: pace,
    rating,
    records,
    tbr,
    habits,
    health,
    formats,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-accent/5 px-3 py-2 text-[11px] text-muted-foreground">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        {tProfile("panelPrivateNote")}
      </p>

      <StatsControls
        basePath={basePath}
        baseParams={{ tab: "estadisticas", ...(monthParam ? { month: monthParam } : {}) }}
        period={period}
        itemFilter={itemFilter}
        metric={metric}
      />

      {/* Una sola secuencia, empaquetada en columnas. `columns` reparte por
          altura sin dejar los huecos que deja una rejilla cuando las tarjetas
          miden distinto, y `break-inside-avoid` impide que una se parta en dos
          columnas. El ORDEN del DOM es el del esquema, que es el que lee un
          lector de pantalla y el que se ve en móvil. */}
      <div className="columns-1 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
        <StatPanel spec={actividad} />
        <StatPanel spec={semana} />
        <StatPanel spec={objetivoHoy} />
        <Card>
          <DailyGoalForm dailyGoalMinutes={ownProfile?.dailyGoalMinutes ?? null} />
        </Card>
        <StatPanel spec={racha} />
        <StatPanel spec={ritmo} />
        <Card>
          <MonthCalendar initialCalendar={calendar} basePath="/" todayKey={todayISO()} />
        </Card>
        <StatPanel spec={pila} />
        <StatPanel spec={balance} />
        <StatPanel spec={valoracion} />
        <StatPanel spec={recordsSpec} />
        <StatPanel spec={habitos} />
      </div>

      <Link
        href="/estadisticas"
        className="self-start text-sm font-medium text-accent hover:underline"
      >
        {tStats("seeFullStats")}
      </Link>
    </div>
  );
}
