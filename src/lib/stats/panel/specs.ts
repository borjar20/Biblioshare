// Configuración declarativa de los paneles de /estadisticas. Aquí NO se pinta
// nada: cada función traduce lo que devuelve un getter de `src/lib/stats/*` a un
// `PanelSpec`, y el armazón hace el resto. Añadir un panel = añadir una función.
//
// Los títulos siguen viniendo de `messages/es.json` (se pasan en `titles`) para
// no duplicar lo que ya existe. La prosa nueva —descripciones, notas y textos
// de vacío— va en literal, como ya hacen `records-card` y `month-calendar`: el
// repo es mono-idioma y estas frases se componen con gramática.

import type { CatalogBreakdown } from "@/lib/stats/get-catalog-breakdown";
import type { YearCompleted } from "@/lib/stats/get-completed-by-year";
import type { Habits } from "@/lib/stats/get-habits";
import type { HoursByMonth } from "@/lib/stats/get-hours-by-month";
import type { RatingDistribution } from "@/lib/stats/get-rating-distribution";
import type { Records } from "@/lib/stats/get-records";
import type { StatusDistribution } from "@/lib/stats/get-status-distribution";
import type { TbrSnapshot } from "@/lib/stats/get-tbr-snapshot";
import type { TopRatedItem } from "@/lib/stats/get-top-rated";
import type { TypeDistribution } from "@/lib/stats/get-type-distribution";
import type { Streaks } from "@/lib/stats/types";
import type { StatsPeriod } from "@/lib/stats/period";
import { UNITS, type PanelSpec } from "./types";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTH_SHORT = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const TYPE_SERIES = [
  { key: "book", label: "Libros", color: "var(--type-book)" },
  { key: "movie", label: "Películas", color: "var(--type-movie)" },
  { key: "series", label: "Series", color: "var(--type-series)" },
];

const STATUS_LABEL = {
  completed: "Completado",
  planned: "Pendiente",
  in_progress: "En curso",
  dropped: "Abandonado",
} as const;

export function periodLabel(period: StatsPeriod): string {
  return period === "all" ? "Todo el histórico" : String(period);
}

/** Títulos, tal cual salen de `messages/es.json`. */
export type PanelTitles = {
  completedByYear: string;
  rating: string;
  topRated: string;
  type: string;
  status: string;
  hours: string;
  genres: string;
  authors: string;
  decades: string;
  habits: string;
  records: string;
  tbr: string;
};

export type SpecInput = {
  period: StatsPeriod;
  titles: PanelTitles;
  /** Hoy, en ISO. Llega del servidor: `new Date()` en render rompe la pureza. */
  todayISO: string;
  byYear: YearCompleted[];
  rating: RatingDistribution;
  topRated: TopRatedItem[];
  type: TypeDistribution;
  status: StatusDistribution;
  hours: HoursByMonth;
  catalog: CatalogBreakdown;
  habits: Habits;
  records: Records;
  streaks: Streaks;
  tbr: TbrSnapshot;
};

export function buildStatsPanels(input: SpecInput): PanelSpec[] {
  const period = periodLabel(input.period);
  return [
    completedByYearPanel(input),
    ratingPanel(input, period),
    topRatedPanel(input, period),
    typePanel(input, period),
    statusPanel(input),
    hoursPanel(input),
    genresPanel(input, period),
    authorsPanel(input, period),
    decadesPanel(input, period),
    habitsPanel(input, period),
    recordsPanel(input, period),
    tbrPanel(input),
  ];
}

// ── Comparativa entre periodos ────────────────────────────────────────────────
function completedByYearPanel({ byYear, titles }: SpecInput): PanelSpec {
  const current = byYear[byYear.length - 1];
  const prev = byYear.length > 1 ? byYear[byYear.length - 2] : null;
  return {
    id: "completadas-por-anio",
    title: titles.completedByYear,
    context: {
      period: "Todos los años con actividad",
      scope: "No obedece al selector de periodo: es la serie histórica completa",
    },
    viz: "stacked",
    unit: UNITS.works,
    labelHeader: "Año",
    series: TYPE_SERIES,
    data: byYear.map((y) => ({
      key: String(y.year),
      label: String(y.year),
      short: String(y.year).slice(2),
      value: y.total,
      parts: [
        { key: "book", value: y.book },
        { key: "movie", value: y.movie },
        { key: "series", value: y.series },
      ],
    })),
    kpis: current
      ? [
          {
            key: "actual",
            label: `Terminadas en ${current.year}`,
            value: current.total,
            unit: UNITS.works,
            delta: prev
              ? {
                  value: current.total - prev.total,
                  unit: UNITS.works,
                  comparedTo: String(prev.year),
                }
              : undefined,
          },
        ]
      : undefined,
    empty: {
      title: "Todavía no has terminado ninguna obra",
      message: "Al cerrar tu primer pase, este panel empieza a contar por años.",
    },
  };
}

// ── Distribución: histograma de notas ─────────────────────────────────────────
function ratingPanel({ rating, titles }: SpecInput, period: string): PanelSpec {
  return {
    id: "valoraciones",
    title: titles.rating,
    context: { period, filters: ["Solo pases con nota"] },
    viz: "bars",
    unit: UNITS.works,
    labelHeader: "Nota",
    valueHeader: "Obras",
    series: [{ key: "count", label: "Obras", color: "var(--gold)" }],
    // Los buckets llegan de 5★ a 1★; el eje se lee mejor de menos a más.
    data: [...rating.buckets]
      .sort((a, b) => a.star - b.star)
      .map((b) => ({
        key: String(b.star),
        label: `${b.star} ${b.star === 1 ? "estrella" : "estrellas"}`,
        short: `${b.star}★`,
        value: b.count,
      })),
    kpis: [
      {
        key: "media",
        label: "Nota media",
        value: rating.average,
        unit: UNITS.stars,
        hint: `Sobre ${rating.count} ${rating.count === 1 ? "obra valorada" : "obras valoradas"}`,
      },
    ],
    note: "La nota interna va de 1 a 10 y se muestra en escala de 5. Un pase sin nota no entra en la media.",
    empty: {
      title: "Aún no has valorado nada",
      message: "Pon una nota al cerrar un pase y aquí verás tu media y el reparto.",
    },
  };
}

// ── Ranking ───────────────────────────────────────────────────────────────────
function topRatedPanel({ topRated, titles }: SpecInput, period: string): PanelSpec {
  const typeLabel: Record<TopRatedItem["type"], string> = {
    book: "Libro",
    movie: "Película",
    series: "Serie",
  };
  return {
    id: "mejor-valoradas",
    title: titles.topRated,
    context: { period, filters: ["Ordenado por nota, de mayor a menor"] },
    viz: "ranking",
    unit: UNITS.stars,
    labelHeader: "Obra",
    valueHeader: "Nota",
    data: topRated.map((it, i) => ({
      key: `${it.type}-${i}`,
      label: it.title,
      value: it.rating,
      detail: typeLabel[it.type],
    })),
    empty: {
      title: "Sin obras valoradas en este periodo",
      message: "Prueba a ampliar el periodo con el selector de arriba.",
    },
  };
}

// ── Parte-todo: tipo de obra ──────────────────────────────────────────────────
function typePanel({ type, titles }: SpecInput, period: string): PanelSpec {
  return {
    id: "por-tipo",
    title: titles.type,
    context: { period, filters: ["Obras terminadas"] },
    viz: "donut",
    unit: UNITS.works,
    labelHeader: "Tipo",
    series: TYPE_SERIES,
    data: [
      { key: "book", label: "Libros", value: type.book },
      { key: "movie", label: "Películas", value: type.movie },
      { key: "series", label: "Series", value: type.series },
    ],
    note: "Cuenta lo que consumiste en el periodo, no lo que tienes en la biblioteca.",
    empty: {
      title: "Nada terminado en este periodo",
      message: "Cierra un pase para que aparezca aquí.",
    },
  };
}

// ── Parte-todo: estados de la biblioteca ──────────────────────────────────────
function statusPanel({ status, titles }: SpecInput): PanelSpec {
  return {
    id: "estados",
    title: titles.status,
    context: {
      period: "Ahora mismo",
      scope: "Foto del momento: el selector de periodo no la afecta",
    },
    viz: "donut",
    unit: UNITS.items,
    labelHeader: "Estado",
    data: status.buckets.map((b) => ({
      key: b.status,
      label: STATUS_LABEL[b.status],
      value: b.count,
    })),
    empty: {
      title: "Tu biblioteca está vacía",
      message: "Añade una obra y verás aquí cómo se reparten sus estados.",
    },
  };
}

// ── Evolución temporal ────────────────────────────────────────────────────────
function hoursPanel({ hours, titles, todayISO }: SpecInput): PanelSpec {
  const currentYear = Number(todayISO.slice(0, 4));
  const currentMonth = Number(todayISO.slice(5, 7));
  return {
    id: "horas-por-mes",
    title: titles.hours,
    context: { period: String(hours.year), filters: ["Sesiones de lectura"] },
    viz: "bars",
    unit: UNITS.minutes,
    labelHeader: "Mes",
    series: [{ key: "minutes", label: "Minutos", color: "var(--accent)" }],
    data: hours.months.map((m) => ({
      key: String(m.month),
      label: MONTHS[m.month - 1],
      short: MONTH_SHORT[m.month - 1],
      // Un mes que todavía no ha llegado NO vale cero: no hay medida.
      value:
        hours.year === currentYear && m.month > currentMonth ? null : m.minutes,
    })),
    note: "Solo cuenta el tiempo de sesiones registradas con duración. Un mes futuro aparece como «Sin datos», no como cero.",
    empty: {
      title: "Sin sesiones registradas este año",
      message: "Registra una sesión con su duración para empezar a acumular.",
    },
  };
}

// ── Distribución por categorías ───────────────────────────────────────────────
function genresPanel({ catalog, titles }: SpecInput, period: string): PanelSpec {
  const top = catalog.genres.slice(0, 6);
  return {
    id: "generos",
    title: titles.genres,
    context: {
      period,
      filters: top.length < catalog.genres.length ? ["6 géneros más frecuentes"] : undefined,
    },
    viz: "bars",
    unit: UNITS.works,
    labelHeader: "Género",
    series: [{ key: "count", label: "Obras", color: "var(--type-book)" }],
    data: top.map((g) => ({ key: g.name, label: g.name, value: g.count })),
    note:
      top.length < catalog.genres.length
        ? `Se muestran 6 de ${catalog.genres.length} géneros. Las cuotas se calculan sobre los mostrados.`
        : undefined,
    empty: {
      title: "Sin géneros que mostrar",
      message: "Los géneros salen de la ficha de catálogo de lo que terminas.",
    },
  };
}

function authorsPanel({ catalog, titles }: SpecInput, period: string): PanelSpec {
  return {
    id: "autores",
    title: titles.authors,
    context: { period, filters: ["Solo autores de libro", "Obras distintas"] },
    viz: "ranking",
    unit: UNITS.works,
    labelHeader: "Autor",
    data: catalog.authors.slice(0, 5).map((a) => ({
      key: a.name,
      label: a.name,
      value: a.works,
    })),
    kpis: [
      {
        key: "nuevos",
        label: "Autores nuevos",
        value: catalog.newAuthors,
        unit: UNITS.authors,
        hint: `De ${catalog.totalAuthors} ${catalog.totalAuthors === 1 ? "autor leído" : "autores leídos"} en el periodo`,
      },
    ],
    empty: {
      title: "Sin autores en este periodo",
      message: "Termina un libro con autor en su ficha para que aparezca.",
    },
  };
}

function decadesPanel({ catalog, titles }: SpecInput, period: string): PanelSpec {
  return {
    id: "decadas",
    title: titles.decades,
    context: { period, filters: ["Década de publicación"] },
    viz: "bars",
    unit: UNITS.works,
    labelHeader: "Década",
    series: [{ key: "count", label: "Obras", color: "var(--accent)" }],
    data: catalog.decades.slice(0, 5).map((d) => ({
      key: String(d.decade),
      label: `Años ${d.decade}`,
      short: String(d.decade).slice(2),
      value: d.count,
    })),
    empty: {
      title: "Sin fechas de publicación",
      message: "La década sale de la ficha de catálogo; algunas obras no la traen.",
    },
  };
}

// ── Indicadores ───────────────────────────────────────────────────────────────
function habitsPanel({ habits, titles }: SpecInput, period: string): PanelSpec {
  const band = habits.favoriteBand
    ? `${pad(habits.favoriteBand.startHour)}:00–${pad((habits.favoriteBand.startHour + 2) % 24)}:00`
    : undefined;
  return {
    id: "habitos",
    title: titles.habits,
    context: { period, filters: ["Sesiones de lectura"] },
    viz: "kpi",
    unit: UNITS.minutes,
    data: [],
    kpis: [
      {
        key: "franja",
        label: "Franja favorita",
        value: null,
        text: band,
        hint: band ? "Banda de 2 horas con más sesiones" : undefined,
      },
      {
        key: "dia",
        label: "Día más lector",
        value: null,
        text: habits.favoriteWeekday === null ? undefined : WEEKDAYS[habits.favoriteWeekday],
      },
      {
        key: "media",
        label: "Sesión media",
        value: habits.averageMinutes,
        unit: UNITS.minutes,
      },
    ],
    note: "La franja solo cuenta sesiones con hora de inicio registrada; el día y la media, todas.",
    empty: {
      title: "Sin sesiones suficientes",
      message: "Registra alguna sesión para que se pueda deducir tu hábito.",
    },
  };
}

function recordsPanel({ records, streaks, titles }: SpecInput, period: string): PanelSpec {
  const month = records.mostActiveMonth;
  return {
    id: "records",
    title: titles.records,
    context: { period },
    viz: "kpi",
    unit: UNITS.works,
    data: [],
    kpis: [
      {
        key: "mes",
        label: "Mes más activo",
        value: null,
        text: month ? `${MONTHS[Number(month.month.slice(5, 7)) - 1]}` : undefined,
        hint: month
          ? `${month.count} ${month.count === 1 ? "obra" : "obras"} terminadas`
          : undefined,
      },
      {
        key: "rapido",
        label: "Libro más rápido",
        value: null,
        text: records.fastestBook?.title,
        hint: records.fastestBook
          ? `${records.fastestBook.days} ${records.fastestBook.days === 1 ? "día" : "días"}`
          : undefined,
      },
      {
        key: "racha",
        label: "Mejor racha",
        value: streaks.best > 0 ? streaks.best : null,
        unit: UNITS.days,
      },
      {
        key: "repasos",
        label: "Repasos",
        value: records.rereads,
        unit: UNITS.passes,
        hint: "Pases que no son el primero de su obra",
      },
    ],
    empty: {
      title: "Todavía no hay récords",
      message: "Necesitas al menos un pase cerrado para que haya algo que batir.",
    },
  };
}

// ── Acumulado / pila ──────────────────────────────────────────────────────────
function tbrPanel({ tbr, titles }: SpecInput): PanelSpec {
  return {
    id: "pila",
    title: titles.tbr,
    context: {
      period: "Ahora mismo",
      scope: "Foto del momento: el selector de periodo no la afecta",
    },
    viz: "donut",
    unit: UNITS.items,
    labelHeader: "Tipo",
    series: TYPE_SERIES,
    data: [
      { key: "book", label: "Libros", value: tbr.byType.book },
      { key: "movie", label: "Películas", value: tbr.byType.movie },
      { key: "series", label: "Series", value: tbr.byType.series },
    ],
    kpis: [{ key: "pendientes", label: "Pendientes", value: tbr.pending, unit: UNITS.items }],
    note: tbr.oldest
      ? `Lo que más lleva esperando: «${tbr.oldest.title}», ${tbr.oldest.monthsWaiting} ${
          tbr.oldest.monthsWaiting === 1 ? "mes" : "meses"
        } en la pila.`
      : undefined,
    empty: {
      title: "No tienes nada pendiente",
      message: "Cuando marques algo como pendiente, aparecerá aquí.",
    },
  };
}

function pad(hour: number): string {
  return String(hour).padStart(2, "0");
}
