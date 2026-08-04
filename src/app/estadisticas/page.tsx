import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { availableYears, resolvePeriod } from "@/lib/stats/period";
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
import { buildStatsPanels, periodLabel } from "@/lib/stats/panel/specs";
import { StatPanel } from "@/components/stats/panel/stat-panel";
import { PeriodPills } from "./period-pills";
import { SHELL_APP } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Estadísticas — Biblioshare",
};

// Muro de estadísticas (frame J, P9): privado, solo del dueño. Desde el rediseño
// de paneles accesibles, la página no monta doce tarjetas a medida: construye
// doce `PanelSpec` y los pinta con UN armazón (`StatPanel`), que garantiza en
// todos el mismo contrato — contexto, resumen textual, indicadores, gráfico
// decorativo y tabla con los valores exactos. Ver
// docs/design/paneles-estadisticos.md.
export default async function FullStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/estadisticas"));

  const t = await getTranslations("stats");
  const { periodo } = await searchParams;
  const period = resolvePeriod(periodo);

  const [
    profile,
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
  ] = await Promise.all([
    getOwnProfile(supabase, user.id),
    getRatingDistribution(supabase, user.id, period),
    getTypeDistribution(supabase, user.id, period),
    getStatusDistribution(supabase, user.id),
    getHoursByMonth(supabase, user.id, period),
    getCatalogBreakdown(supabase, user.id, period),
    getHabits(supabase, user.id, period),
    getRecords(supabase, user.id, period),
    getStreaks(supabase, user.id),
    getTbrSnapshot(supabase, user.id),
    getCompletedByYear(supabase, user.id),
    getTopRated(supabase, user.id, period),
  ]);

  const backHref = profile ? `/u/${profile.username}?tab=estadisticas` : "/";

  const panels = buildStatsPanels({
    period,
    todayISO: toISODate(new Date()),
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
          cada panel repite después el periodo que le toca, porque tres de ellos
          son una foto del momento y no lo obedecen. */}
      <div className="mb-2">
        <PeriodPills current={period} years={availableYears()} />
      </div>
      <p className="mb-4 text-[11px] text-muted-foreground">
        {`Periodo aplicado: ${periodLabel(period)}. Los paneles marcados como «ahora mismo» son una foto del momento y no cambian con este selector.`}
      </p>

      <div className="columns-1 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {panels.map((spec) => (
          <StatPanel key={spec.id} spec={spec} />
        ))}
      </div>
    </main>
  );
}
