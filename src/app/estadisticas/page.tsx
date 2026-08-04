import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { periodLabel, resolvePeriod } from "@/lib/stats/period";
import { resolveActivityMetric, resolveItemFilter } from "@/lib/stats/filter";
import { toISODate } from "@/lib/stats/dates";
import { getRatingDistribution } from "@/lib/stats/get-rating-distribution";
import { getTypeDistribution } from "@/lib/stats/get-type-distribution";
import { getStatusDistribution } from "@/lib/stats/get-status-distribution";
import { getHoursByMonth } from "@/lib/stats/get-hours-by-month";
import { getCatalogBreakdown } from "@/lib/stats/get-catalog-breakdown";
import { getHabits } from "@/lib/stats/get-habits";
import { getRecords } from "@/lib/stats/get-records";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getTbrSnapshot } from "@/lib/stats/get-tbr-snapshot";
import { getCompletedByYear } from "@/lib/stats/get-completed-by-year";
import { getTopRated } from "@/lib/stats/get-top-rated";
import { getPeriodActivity } from "@/lib/stats/get-period-activity";
import { getLibraryHealth } from "@/lib/stats/get-library-health";
import { getRatedFacets } from "@/lib/stats/get-rated-facets";
import { getFormatStats } from "@/lib/stats/get-format-stats";
import { getYearCalendar } from "@/lib/stats/get-year-calendar";
import { getPagesPerDay } from "@/lib/stats/get-pace";
import { buildStatsSections } from "@/lib/stats/panel/specs";
import { StatPanel } from "@/components/stats/panel/stat-panel";
import { StatsControls } from "@/components/stats/stats-controls";
import { SHELL_APP } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Estadísticas — Biblioshare",
};

// Muro de estadísticas: privado, solo del dueño. La página no monta tarjetas a
// medida — construye `PanelSpec` y los pinta con UN armazón (`StatPanel`), que
// garantiza en todos el mismo contrato: contexto, resumen textual, indicadores,
// gráfico decorativo y tabla con los valores exactos.
//
// Desde la reorganización, los paneles van AGRUPADOS EN SECCIONES en vez de
// sueltos en una rejilla: resumen · actividad · hábitos · biblioteca ·
// valoraciones · gustos · por categoría. El título de la sección contesta antes
// que el de la tarjeta a la pregunta que más se falla — si «Décadas» habla de
// lo que ves o de lo que tienes esperando.
//
// Ver docs/design/paneles-estadisticos.md.
export default async function FullStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tipo?: string; medida?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/estadisticas"));

  const t = await getTranslations("stats");
  const { periodo, tipo, medida } = await searchParams;
  const period = resolvePeriod(periodo);
  const itemFilter = resolveItemFilter(tipo);
  const metric = resolveActivityMetric(medida);
  const todayISO = toISODate(new Date());
  const calendarYear = typeof period === "number" ? period : Number(todayISO.slice(0, 4));

  const [
    profile,
    activity,
    rating,
    type,
    status,
    hours,
    catalog,
    habits,
    records,
    streaks,
    tbr,
    byYear,
    topRated,
    health,
    facets,
    formats,
    calendar,
    pagesPerDay,
  ] = await Promise.all([
    getOwnProfile(supabase, user.id),
    getPeriodActivity(supabase, user.id, period, itemFilter),
    getRatingDistribution(supabase, user.id, period, itemFilter),
    getTypeDistribution(supabase, user.id, period),
    getStatusDistribution(supabase, user.id, itemFilter),
    getHoursByMonth(supabase, user.id, period),
    getCatalogBreakdown(supabase, user.id, period, itemFilter),
    getHabits(supabase, user.id, period, itemFilter),
    getRecords(supabase, user.id, period, itemFilter),
    getStreaks(supabase, user.id),
    getTbrSnapshot(supabase, user.id, itemFilter),
    getCompletedByYear(supabase, user.id),
    getTopRated(supabase, user.id, period, 6, itemFilter),
    getLibraryHealth(supabase, user.id, period, itemFilter),
    getRatedFacets(supabase, user.id, period, itemFilter),
    getFormatStats(supabase, user.id, period),
    getYearCalendar(supabase, user.id, calendarYear),
    getPagesPerDay(supabase, user.id, period),
  ]);

  const backHref = profile ? `/u/${profile.username}?tab=estadisticas` : "/";

  const sections = buildStatsSections({
    period,
    itemFilter,
    metric,
    todayISO,
    titles: {
      completedByYear: t("completedByYearTitle"),
      rating: t("ratingTitle"),
      topRated: t("topRatedTitle"),
      type: t("typeTitle"),
      status: t("statusTitle"),
      hours: t("hoursTitle"),
      genres: t("genresTitle"),
      authors: t("authorsTitle"),
      decades: t("decadesTitle"),
      habits: t("habitsTitle"),
      records: t("recordsTitle"),
      tbr: t("tbrTitle"),
    },
    activity,
    byYear,
    rating,
    topRated,
    type,
    status,
    hours,
    catalog,
    habits,
    records,
    streaks,
    tbr,
    health,
    facets,
    formats,
    calendar,
    pagesPerDay,
  });

  return (
    <main className={`mx-auto w-full ${SHELL_APP} px-4 py-4 pb-24 sm:px-6 lg:px-8`}>
      <div className="mb-4">
        <PageHeader
          title={t("fullStatsTitle")}
          backHref={backHref}
          backLabel={t("back")}
        />
      </div>

      {/* Una sola fila de filtros para TODO el muro (nunca filtros por panel):
          cada panel repite después el periodo que le toca, porque varios son una
          foto del momento y no lo obedecen. */}
      <div className="mb-2">
        <StatsControls
          basePath="/estadisticas"
          period={period}
          itemFilter={itemFilter}
          metric={metric}
        />
      </div>
      <p className="mb-6 text-[11px] text-muted-foreground">
        {`Periodo aplicado: ${periodLabel(period)}. Los paneles marcados como «ahora mismo» son una foto del momento y no cambian con este selector; los anuales se miden sobre el año natural.`}
      </p>

      {/* Índice de secciones: con siete bloques, bajar a «Por categoría»
          scrolleando es peor que un salto. Son anclas, no JavaScript. */}
      <nav aria-label="Secciones" className="mb-6 flex flex-wrap gap-x-4 gap-y-1">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-[12px] font-medium text-accent hover:underline"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-10">
        {sections.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
            <div className="mb-3 flex flex-col gap-0.5">
              <h2
                id={`${section.id}-heading`}
                className="font-serif text-lg leading-tight font-semibold text-foreground"
              >
                {section.title}
              </h2>
              <p className="text-[11.5px] text-muted-foreground">{section.description}</p>
            </div>
            {/* Rejilla, no `columns`: las tarjetas de una fila comparten altura
                y la sección termina a ras, sin la columna a medias que dejaba
                el reparto por altura cuando una tarjeta era mucho más alta que
                el resto. Ver la nota de la pestaña del perfil. */}
            <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {section.panels.map((spec) => (
                // h3: los paneles cuelgan del título de su sección, que es h2.
                <StatPanel key={spec.id} spec={spec} headingLevel={3} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
