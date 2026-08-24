import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import {
  periodLabel,
  resolvePeriod,
  type StatsPeriod,
} from "@/lib/stats/period";
import {
  activityMetricLabel,
  itemFilterLabel,
  resolveActivityMetric,
  resolveItemFilter,
  type ActivityMetric,
  type ItemFilter,
} from "@/lib/stats/filter";
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
import { getRereads } from "@/lib/stats/get-rereads";
import { getDropStats } from "@/lib/stats/get-drop-reasons";
import { getNotesPerWork } from "@/lib/stats/get-notes-per-work";
import {
  buildStatsSections,
  collapsedPanelCount,
  hiddenPanelCount,
} from "@/lib/stats/panel/specs";
import { StatPanel } from "@/components/stats/panel/stat-panel";
import { StatsControls } from "@/components/stats/stats-controls";
import { StatsWallSkeleton } from "@/components/stats/stats-wall-skeleton";
import { SectionTabs } from "./section-tabs";
import { SHELL_APP } from "@/lib/ui/layout";
import { PageHeader } from "@/components/ui/page-header";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
// El SHELL (cabecera + filtros) se pinta sin esperar a los datos; el muro —18
// consultas— llega detrás de un <Suspense> (#440). Antes no había boundary, así
// que al entrar por URL directa (enlace compartido, recarga, PWA) no se veía
// NADA hasta que terminaba la consulta más lenta de las 18. El `loading.tsx` solo
// cubría la navegación desde dentro, no la entrada directa.
//
// Un solo boundary para todo el muro, no uno por sección: varias de las 18
// consultas alimentan varias secciones (actividad, nota, horas, récords, ritmo),
// así que un boundary por sección o duplicaría consultas o exigiría hacer
// cacheables los 18 getters. Con uno solo, el shell aparece ya y el muro entero
// llega junto — que es lo que arregla el problema que se reportó.
//
// Ver docs/design/paneles-estadisticos.md.
export default async function FullStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tipo?: string; medida?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/estadisticas"));

  const t = await getTranslations("stats");
  const { periodo, tipo, medida } = await searchParams;
  // Sin `?periodo=`, TODO EL HISTÓRICO. Antes arrancaba en el año en curso, y
  // eso ponía la vista en su peor estado nada más entrar: con «2026» puesto,
  // las tarjetas de serie histórica (completadas por año, evolución de la pila)
  // y las de foto del momento seguían enseñando lo suyo, así que la primera
  // lectura de la pantalla era un selector diciendo una cosa y media docena de
  // paneles diciendo otra. Con «Todo» el rótulo y el contenido coinciden, y
  // acotar pasa a ser una decisión deliberada de quien mira.
  const period = resolvePeriod(periodo, undefined, "all");
  const itemFilter = resolveItemFilter(tipo);
  const metric = resolveActivityMetric(medida);

  // Lo único que el SHELL espera: el @usuario, para el enlace de volver. Una
  // consulta ligera (índice por user_id), no las 18 del muro. getOwnProfile crea
  // su propio cliente y va memoizado por userId (#456).
  const profile = await getOwnProfile(user.id);
  const backHref = profile ? `/u/${profile.username}?tab=estadisticas` : "/";

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
          foto del momento y no lo obedecen.

          PLEGADOS, y con `<details>` nativo — cero JavaScript, y el estado
          abierto/cerrado no viaja en la URL porque no es parte de la pregunta.
          Tres grupos de pastillas ocupaban dos filas altas que se leen UNA vez
          (al entrar, o al cambiar de periodo) y estorban en todas las demás;
          debajo van siete secciones de tarjetas, que es lo que se viene a ver.
          El resumen tiene que decir qué hay puesto: un plegable que solo dijera
          «Filtros» obligaría a abrirlo para saber de qué periodo habla la
          pantalla, y entonces plegarlo costaría más de lo que ahorra. */}
      <details className="mb-2 rounded-card border border-border bg-surface">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-[12.5px] text-muted-foreground marker:text-accent">
          <span className="label-section text-foreground">Filtros</span>
          <span className="font-medium text-foreground">{periodLabel(period)}</span>
          <span aria-hidden>·</span>
          <span>{itemFilterLabel(itemFilter)}</span>
          <span aria-hidden>·</span>
          <span>{activityMetricLabel(metric)}</span>
        </summary>
        <div className="border-t border-border p-3">
          <StatsControls
            basePath="/estadisticas"
            period={period}
            itemFilter={itemFilter}
            metric={metric}
          />
        </div>
      </details>

      {/* El muro —18 consultas— detrás de su boundary. El fallback reserva altura
          (masonry) para no mover columnas al resolverse (CLS, #284/#440). */}
      <Suspense fallback={<StatsWallSkeleton />}>
        <StatsWall
          userId={user.id}
          period={period}
          itemFilter={itemFilter}
          metric={metric}
        />
      </Suspense>
    </main>
  );
}

// El muro: las 18 consultas, la construcción de secciones y el render de los
// paneles. Todo detrás del <Suspense> del shell.
async function StatsWall({
  userId,
  period,
  itemFilter,
  metric,
}: {
  userId: string;
  period: StatsPeriod;
  itemFilter: ItemFilter;
  metric: ActivityMetric;
}) {
  const supabase = await createClient();
  const t = await getTranslations("stats");
  const todayISO = toISODate(new Date());
  const calendarYear =
    typeof period === "number" ? period : Number(todayISO.slice(0, 4));

  const [
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
    rereads,
    drops,
    annotations,
  ] = await Promise.all([
    getPeriodActivity(supabase, userId, period, itemFilter),
    getRatingDistribution(supabase, userId, period, itemFilter),
    getTypeDistribution(supabase, userId, period),
    getStatusDistribution(supabase, userId, itemFilter),
    getHoursByMonth(supabase, userId, period),
    getCatalogBreakdown(supabase, userId, period, itemFilter),
    getHabits(supabase, userId, period, itemFilter),
    getRecords(supabase, userId, period, itemFilter),
    getStreaks(supabase, userId),
    getTbrSnapshot(supabase, userId, itemFilter),
    getCompletedByYear(supabase, userId),
    getTopRated(supabase, userId, period, 6, itemFilter),
    getLibraryHealth(supabase, userId, period, itemFilter),
    getRatedFacets(supabase, userId, period, itemFilter),
    getFormatStats(supabase, userId, period),
    getYearCalendar(supabase, userId, calendarYear),
    getPagesPerDay(supabase, userId, period),
    // Sin periodo: una relectura son dos pases separados por años y recortarlos
    // a la ventana elegida dejaría fuera el primero, que es media comparación.
    getRereads(supabase, userId, itemFilter),
    // Lee de `pass_reviews`, no de `passes`: el motivo de abandono no tiene
    // grant de SELECT en la tabla y solo la vista lo enmascara por dueño.
    getDropStats(supabase, userId, itemFilter),
    getNotesPerWork(supabase, userId, period),
  ]);

  const panelInput = {
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
    rereads,
    drops,
    annotations,
  };

  const sections = buildStatsSections(panelInput);
  // Los paneles que este periodo no puede contestar no se pintan. Se DICE
  // cuántos son: un panel que desaparece sin explicación se lee como que la
  // página se rompió, y el calendario anual es de los que más se buscan.
  const escondidos = hiddenPanelCount(panelInput);
  // Y los que se pliegan a una línea por no poder tener datos NUNCA, que es otra
  // cosa: esos no dependen del periodo y ampliarlo no los devuelve.
  const plegados = collapsedPanelCount(panelInput);

  return (
    <>
      {/* Qué periodo hay puesto y —lo que antes no se decía— qué se ha dejado
          de enseñar por él. Un panel que desaparece sin explicación se lee como
          una página rota; y el calendario anual es de los que más se buscan. */}
      <p className="mb-4 text-[11px] text-muted-foreground">
        {`Periodo aplicado: ${periodLabel(period)}.`}{" "}
        {escondidos === 0
          ? "Los paneles marcados como «ahora mismo» son una foto del momento y no cambian con este selector; los anuales se miden sobre el año natural."
          : `Se ocultan ${escondidos} paneles que no pueden contestar a esta ventana: ${
              period === "week" || period === "month"
                ? "los de foto del momento y los que necesitan meses o años (el año natural, la serie histórica y los récords)"
                : "los de foto del momento, que no hablan de un año sino de ahora"
            }. Amplía el periodo para verlos.`}
        {plegados > 0 &&
          ` Otros ${plegados} se pliegan a una línea porque no pueden tener datos con ningún periodo: son los que solo existen para un tipo de obra que todavía no has terminado.`}
      </p>

      {/* Índice de secciones: con siete bloques, bajar a «Por categoría»
          scrolleando es peor que un salto. Marca en cuál estás — sin eso son
          siete atajos del mismo color, no un mapa. */}
      <SectionTabs sections={sections.map(({ id, title }) => ({ id, title }))} />

      {/* El margen de salto ya no es un `scroll-mt-20` a ojo: ahora hay DOS
          cabeceras pegadas arriba (la de la app y el índice de secciones), así
          que el título saltado tiene que caber por debajo de las dos o el
          enlace del índice deja su propio destino tapado. */}
      <div className="flex flex-col gap-10">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="scroll-mt-[calc(var(--topbar-h)+72px)]"
          >
            <div className="mb-3 flex flex-col gap-0.5">
              <h2
                id={`${section.id}-heading`}
                className="font-serif text-lg leading-tight font-semibold text-foreground"
              >
                {section.title}
              </h2>
              <p className="text-[11.5px] text-muted-foreground">{section.description}</p>
            </div>
            {/* MASONRY con multicolumna, igual que la pestaña del perfil.
                Antes era una rejilla, y la rejilla iguala el alto de cada FILA:
                una tarjeta de indicadores al lado del histograma de notas
                dejaba su hueco muerto hasta la fila siguiente, y con siete
                secciones esos huecos se sumaban a media pantalla de aire.
                Aquí el reparto se hace por sección, no en toda la página, así
                que el desequilibrio que puede acumular una columna nunca pasa
                de la sección en la que ocurre — que es lo que hace tolerable
                lo que multicolumna no sabe hacer: partir una tarjeta.
                `break-inside-avoid` es lo que impide que se parta, y el margen
                va en cada hijo porque `gap` no separa dentro de una columna. */}
            <div className="columns-1 gap-4 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
              {section.panels.map((spec) => (
                // h3: los paneles cuelgan del título de su sección, que es h2.
                //
                // El HÉROE rompe la multicolumna con `column-span: all`. Es lo
                // que evita tener que volver a `grid` —descartada arriba por
                // igualar el alto de cada fila— para conseguir una tarjeta
                // ancha: multicolumna sí sabe hacer esto, y el resto de paneles
                // sigue fluyendo debajo sin hueco muerto.
                //
                // El `div` envolvente es quien recibe ahora `[&>*]:mb-4` y
                // `[&>*]:break-inside-avoid` del contenedor, por ser el hijo
                // directo; por eso la `key` viaja aquí.
                <div
                  key={spec.id}
                  className={spec.hero ? "[column-span:all]" : undefined}
                >
                  <StatPanel spec={spec} headingLevel={3} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
