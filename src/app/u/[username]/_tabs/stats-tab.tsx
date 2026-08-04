import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getRatingDistribution } from "@/lib/stats/get-rating-distribution";
import { getTbrSnapshot } from "@/lib/stats/get-tbr-snapshot";
import { getHabits } from "@/lib/stats/get-habits";
import { getPagesPerDay } from "@/lib/stats/get-pace";
import { getLibraryHealth } from "@/lib/stats/get-library-health";
import { getFormatStats } from "@/lib/stats/get-format-stats";
import { resolveActivityMetric } from "@/lib/stats/filter";
import { buildProfilePanels } from "@/lib/stats/panel/specs";
import { StatPanel } from "@/components/stats/panel/stat-panel";
import { StatsControls } from "@/components/stats/stats-controls";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { todayISO } from "@/lib/stats/dates";

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * La pestaña está FIJADA al mes y a todos los tipos. No es una limitación
 * técnica: es que aquí la pregunta ya está hecha —«¿cómo llevo el mes?»— y el
 * calendario que la acompaña es mensual. Un selector de periodo al lado de un
 * calendario de treinta días invita a poner «2025» y dejar la mitad de la
 * pantalla contando otra cosa. Para cambiar la pregunta está /estadisticas.
 */
const PERIOD = "month" as const;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
// la actividad del periodo.
//
// Sigue fuera del armazón el calendario mensual: no es un panel de lectura,
// es un control con estado propio. El editor de objetivo diario se fue al
// Rincón, con los retos.
export async function StatsTab({
  userId,
  basePath,
  monthParam,
  metricParam,
}: {
  userId: string;
  basePath: string;
  monthParam?: string;
  metricParam?: string;
}) {
  const tProfile = await getTranslations("profile");
  const tStats = await getTranslations("stats");
  const supabase = await createClient();

  const metric = resolveActivityMetric(metricParam);
  const month = MONTH_RE.test(monthParam ?? "") ? (monthParam as string) : currentMonthKey();

  const [weekly, streaks, calendar, rating, tbr, habits, pace, health, formats] =
    await Promise.all([
      getWeeklyActivity(supabase, userId),
      getStreaks(supabase, userId),
      getMonthCalendar(supabase, userId, month),
      getRatingDistribution(supabase, userId, PERIOD),
      getTbrSnapshot(supabase, userId),
      getHabits(supabase, userId, PERIOD),
      // El ritmo va a propósito sobre TODO el histórico, no sobre el mes: es la
      // cifra con la que se estima cuánto tardas en algo, y una media de treinta
      // días la mueve cualquier semana rara. Su panel lo declara en el rótulo.
      getPagesPerDay(supabase, userId, "all"),
      getLibraryHealth(supabase, userId, PERIOD),
      getFormatStats(supabase, userId, PERIOD),
    ]);

  const [semana, racha, ritmo, pila, valoracion, habitos] = buildProfilePanels({
    period: PERIOD,
    metric,
    titles: {
      // Literal, no `stats.weeklyTitle`: esa clave dice «Lectura esta semana»
      // y la usa la tira del inicio, que solo cuenta minutos de lectura. Aquí
      // el panel alterna entre minutos y OBRAS de cualquier tipo, y con el
      // conmutador en «Obras» ese título estaría contando películas bajo un
      // rótulo que promete lectura.
      weekly: "Esta semana",
      streak: tStats("streakTitle"),
      pace: tStats("paceTitle"),
      rating: tStats("ratingTitle"),
      tbr: tStats("tbrTitle"),
      habits: tStats("habitsTitle"),
    },
    weekly,
    streaks,
    pagesPerDay: pace,
    rating,
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
        metric={metric}
      />

      {/* MASONRY con multicolumna, no rejilla.
          Con `grid items-start`, cada fila la marca la tarjeta más alta: una
          tarjeta corta al lado del calendario dejaba su hueco vacío hasta la
          fila siguiente, y esos huecos se sumaban a lo largo de la pestaña.
          `columns` deja que cada tarjeta empiece donde acabó la anterior de su
          columna, que es justo lo que se pedía.
          `break-inside-avoid` es lo que impide que una tarjeta se PARTA entre
          dos columnas —sin él, multicolumna corta por donde quiera y media
          tarjeta aparece arriba del todo a la derecha—, y el margen inferior
          va en cada hijo porque `gap` no separa dentro de una columna.
          Se lee en columnas, no en filas: primero la columna izquierda entera
          y luego la derecha. El orden del DOM es el del esquema, que es el que
          oye un lector de pantalla y el que se ve en móvil (una columna). */}
      <div className="columns-1 gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
        <StatPanel spec={semana} />
        <StatPanel spec={racha} />
        <StatPanel spec={ritmo} />
        <StatPanel spec={pila} />
        <StatPanel spec={valoracion} />
        <StatPanel spec={habitos} />
        {/* El calendario va el ÚLTIMO, y no en mitad del orden del esquema, por
            una razón de reparto: mide él solo más que las tres tarjetas más
            cortas juntas y no se puede partir entre columnas. En medio obligaba
            a la multicolumna a cerrar la primera columna mucho más abajo que la
            segunda, y el hueco que dejaba al pie era exactamente el que se
            quería quitar. Al final, es lo que cierra las dos. */}
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <MonthCalendar initialCalendar={calendar} basePath="/" todayKey={todayISO()} />
        </div>
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
