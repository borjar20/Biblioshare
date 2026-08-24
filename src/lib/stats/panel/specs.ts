// Configuración declarativa de los paneles estadísticos. Aquí NO se pinta nada:
// cada función traduce lo que devuelve un getter de `src/lib/stats/*` a un
// `PanelSpec`, y el armazón hace el resto. Añadir un panel = añadir una función.
//
// El muro completo se agrupa en SECCIONES (`buildStatsSections`), siguiendo el
// esquema de estadísticas: resumen · actividad · hábitos · biblioteca ·
// valoraciones · gustos · por categoría. Doce tarjetas sueltas en una rejilla
// no se leen: hay que saber si «Décadas» habla de lo que ves o de lo que tienes
// pendiente, y eso lo contesta el título de su sección antes que el suyo.
//
// La pestaña del perfil (`buildProfilePanels`) es la vista corta del mismo
// esquema, y está FIJADA al mes y a todos los tipos: qué has hecho · hábito ·
// pila · valoración · cuándo consumes. Sin selector de periodo ni de tipo — el
// muro completo es el sitio donde se cambia la pregunta.
//
// Los títulos siguen viniendo de `messages/es.json` (se pasan en `titles`) para
// no duplicar lo que ya existe. La prosa nueva —descripciones, notas y textos
// de vacío— va en literal: el repo es mono-idioma y estas frases se componen
// con gramática.

import type { CatalogBreakdown } from "@/lib/stats/get-catalog-breakdown";
import type { YearCompleted } from "@/lib/stats/get-completed-by-year";
import type { FormatStats } from "@/lib/stats/get-format-stats";
import type { Habits } from "@/lib/stats/get-habits";
import type { HoursByMonth } from "@/lib/stats/get-hours-by-month";
import type { LibraryHealth } from "@/lib/stats/get-library-health";
import type { ActivityBucket, PeriodActivity } from "@/lib/stats/get-period-activity";
import type { RatedFacets, RatedGroup } from "@/lib/stats/get-rated-facets";
import type { RatingDistribution } from "@/lib/stats/get-rating-distribution";
import type { DropReason, DropStats } from "@/lib/stats/get-drop-reasons";
import type { NotesPerWork } from "@/lib/stats/get-notes-per-work";
import type { ReadingSpeed } from "@/lib/stats/get-pace";
import type { Records } from "@/lib/stats/get-records";
import type { Rereads } from "@/lib/stats/get-rereads";
import type { StatusDistribution } from "@/lib/stats/get-status-distribution";
import type { TbrSnapshot } from "@/lib/stats/get-tbr-snapshot";
import type { TopRatedItem } from "@/lib/stats/get-top-rated";
import type { TypeDistribution } from "@/lib/stats/get-type-distribution";
import type { YearCalendar } from "@/lib/stats/get-year-calendar";
import type { DayActivity, Streaks } from "@/lib/stats/types";
import {
  type ActivityMetric,
  type ItemFilter,
  itemFilterLabel,
  itemFilterParam,
} from "@/lib/stats/filter";
import {
  type StatsPeriod,
  periodLabel,
  previousLabel,
} from "@/lib/stats/period";
import { starLabel } from "@/lib/stats/rating";
import { UNITS, type PanelKpi, type PanelSpec, type Unit } from "./types";

export { periodLabel };

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTH_SHORT = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
// Tres letras para el eje del mosaico anual: con una sola inicial, marzo y mayo
// («M») caerían idénticos en un eje de doce rótulos y no se podrían distinguir.
const MONTH_SHORT_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
// Iniciales del calendario del repo: la X de miércoles evita la colisión con martes.
const WEEKDAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"];

const TYPE_SERIES = [
  { key: "book", label: "Libros", color: "var(--type-book)" },
  { key: "movie", label: "Películas", color: "var(--type-movie)" },
  { key: "series", label: "Series", color: "var(--type-series)" },
];

const STATUS_SERIES = [
  { key: "completed", label: "Completado", color: "var(--status-completed)" },
  { key: "planned", label: "Pendiente", color: "var(--status-planned)" },
  { key: "in_progress", label: "En curso", color: "var(--status-in-progress)" },
  { key: "dropped", label: "Abandonado", color: "var(--status-dropped)" },
];

const STATUS_LABEL = {
  completed: "Completado",
  planned: "Pendiente",
  in_progress: "En curso",
  dropped: "Abandonado",
} as const;

/** Cuántos nombres entran en un ranking antes de que la lista deje de leerse. */
const RANK_LIMIT = 6;

/** El filtro global, listo para el rótulo. `undefined` cuando no hay ninguno. */
function globalFilter(itemFilter: ItemFilter): string | undefined {
  return itemFilter === "all" ? undefined : itemFilterLabel(itemFilter);
}

/**
 * Alcance de un panel que NO puede obedecer al filtro de tipo: o la consulta
 * que lo alimenta no lo acepta, o el panel es justo el que responde a esa
 * pregunta.
 *
 * Se compone con el alcance que ya tuviera, y solo aparece cuando hay filtro
 * puesto. Callarlo sería el peor de los dos errores posibles: con el muro en
 * «Libros», una tarjeta que sigue contando películas y no lo dice es
 * indistinguible de una que sí filtró.
 */
function withAllTypes(itemFilter: ItemFilter, scope?: string): string | undefined {
  if (itemFilter === "all") return scope;
  return scope ? `${scope} · todos los tipos` : "todos los tipos";
}

/** Una sección del muro: un título y sus paneles. */
export type PanelSection = {
  id: string;
  title: string;
  /** Qué pregunta contesta la sección. Una línea, no un párrafo. */
  description: string;
  panels: PanelSpec[];
};

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

export type StatsInput = {
  period: StatsPeriod;
  itemFilter: ItemFilter;
  metric: ActivityMetric;
  titles: PanelTitles;
  /** Hoy, en ISO. Llega del servidor: `new Date()` en render rompe la pureza. */
  todayISO: string;
  activity: PeriodActivity;
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
  health: LibraryHealth;
  facets: RatedFacets;
  formats: FormatStats;
  calendar: YearCalendar;
  pagesPerDay: number | null;
  rereads: Rereads;
  drops: DropStats;
  annotations: NotesPerWork;
  speed: ReadingSpeed;
};

// ══ El muro completo, por secciones ══════════════════════════════════════════

/**
 * ¿Puede este panel contestar al periodo elegido?
 *
 * Hasta aquí, un panel que no obedecía al selector se enseñaba igual y lo
 * declaraba en su rótulo. La regla se queda para lo que SÍ tiene sitio —el
 * filtro de tipo, o «ahora mismo» dentro de «todo»— pero **declarar no basta
 * cuando la distancia es grande**: con «Semana» puesto, doce meses de barras al
 * lado de siete días no se leen como un alcance distinto, se leen como que la
 * pantalla no hizo caso. Y son doce tarjetas, no una.
 *
 * Así que a partir de aquí, lo que no puede contestar **no se enseña**:
 *
 * | Periodo | Fuera |
 * |---|---|
 * | Semana · Mes | los `long` (año natural, serie histórica, récords) y los `snapshot` |
 * | Un año | los `snapshot` |
 * | Todo | nada — «ahora» es parte de «todo» |
 *
 * Lo que queda no es un recorte silencioso: la página dice cuántos paneles
 * escondió y por qué, para que nadie crea que su calendario se rompió.
 */
export function fitsPeriod(spec: PanelSpec, period: StatsPeriod): boolean {
  if (spec.dataWindow === "snapshot") return period === "all";
  if (spec.dataWindow === "long") return period !== "week" && period !== "month";
  return true;
}

/**
 * ¿Has terminado alguna obra de este tipo EN TODO EL HISTÓRICO?
 *
 * `byYear` es la única señal del muro que ignora a la vez el periodo y el filtro
 * de tipo —`getCompletedByYear` no recibe ninguno de los dos—, y eso es justo lo
 * que exige el nivel 1: «no puede tener datos nunca» no se puede decidir con una
 * cifra que el selector de periodo acaba de recortar.
 *
 * Cuenta obras TERMINADAS, así que solo vale para los paneles que también miden
 * lo terminado. `series-formato` mide episodios vistos y por eso NO lo usa: quien
 * lleva media temporada de tres series tiene datos y cero series terminadas.
 */
function everFinished(byYear: YearCompleted[], type: "book" | "movie"): boolean {
  return byYear.some((y) => y[type] > 0);
}

/**
 * Los paneles que solo existen para un tipo de obra que nunca has terminado. La
 * frase va en primera persona del panel, no del sistema: dice qué falta, no que
 * algo se haya escondido.
 */
const NEVER_BOOKS = "No has terminado ningún libro todavía";
const NEVER_MOVIES = "No has terminado ninguna película todavía";

/**
 * La vista sin recortar por periodo, conservando el tipo elegido.
 *
 * Sin `?periodo=` el muro arranca en «todo el histórico» (ver `page.tsx`), así
 * que la salida es quitar el parámetro. El de tipo se conserva a propósito:
 * mandar a «todo» a quien acaba de elegir «libros» le deshace dos filtros
 * cuando solo le sobraba uno.
 */
function allTimeHref(itemFilter: ItemFilter): string {
  return itemFilter === "all"
    ? "/estadisticas"
    : `/estadisticas?tipo=${itemFilterParam(itemFilter)}`;
}

/**
 * NIVEL 2 — la salida del vacío por filtro, cuando la hay.
 *
 * Devuelve `undefined` en los dos casos en que el enlace mentiría: con «Todo»
 * puesto no hay ningún fuera al que ir, y sin histórico el sitio al que lleva
 * está igual de vacío. Un enlace que promete un dato que no existe es peor que
 * no ofrecer ninguno.
 */
function wayOutToAllTime(
  { period, itemFilter }: StatsInput,
  everTotal: number,
  text: string,
): NonNullable<PanelSpec["empty"]>["elsewhere"] | undefined {
  if (period === "all" || everTotal <= 0) return undefined;
  return { text, href: allTimeHref(itemFilter), label: "Ver todo el histórico" };
}

/** Obras terminadas en TODO el histórico. `byYear` no obedece a ningún filtro. */
function everFinishedTotal(byYear: YearCompleted[]): number {
  return byYear.reduce((n, y) => n + y.total, 0);
}

export function buildStatsSections(input: StatsInput): PanelSection[] {
  const period = periodLabel(input.period);
  // El filtro global va SUELTO al rótulo, no mezclado con los filtros propios
  // de cada panel: lo acaba de elegir quien mira, y tiene que verse junto a la
  // cifra. «Todo» no se anuncia — repetirlo en cada tarjeta es ruido.
  const filter =
    input.itemFilter === "all" ? undefined : itemFilterLabel(input.itemFilter);

  // Se filtran los paneles y, después, las secciones que se quedan sin
  // ninguno: un título con su descripción y nada debajo se lee como un
  // agujero, y además dejaría un enlace del índice llevando a la nada.
  return allSections(input, period, filter)
    .map((section) => ({
      ...section,
      panels: section.panels.filter((spec) => fitsPeriod(spec, input.period)),
    }))
    .filter((section) => section.panels.length > 0);
}

/** Cuántos paneles esconde el periodo elegido. Lo dice la página, no se calla. */
export function hiddenPanelCount(input: StatsInput): number {
  const all = allSections(input, periodLabel(input.period), undefined);
  const total = all.reduce((n, s) => n + s.panels.length, 0);
  const shown = all.reduce(
    (n, s) => n + s.panels.filter((spec) => fitsPeriod(spec, input.period)).length,
    0,
  );
  return total - shown;
}

/** Cuántos paneles se pliegan por no poder tener datos nunca. */
export function collapsedPanelCount(input: StatsInput): number {
  return allSections(input, periodLabel(input.period), undefined)
    .filter((s) => s.panels.some((spec) => fitsPeriod(spec, input.period)))
    .reduce(
      (n, s) =>
        n +
        s.panels.filter(
          (spec) => spec.structurallyEmpty && fitsPeriod(spec, input.period),
        ).length,
      0,
    );
}

function allSections(
  input: StatsInput,
  period: string,
  filter: string | undefined,
): PanelSection[] {
  return [
    {
      id: "resumen",
      title: "Resumen general",
      description: "Cuánto llevas en el periodo y cómo se reparte.",
      panels: [summaryPanel(input, period), typePanel(input, period)],
    },
    {
      id: "actividad",
      title: "Actividad",
      description: "Cuándo ocurrió, en qué ritmo y con qué constancia.",
      panels: [
        // El héroe va PRIMERO (invariante de `specs.test.ts`): ocupa las tres
        // columnas, así que cualquier panel por encima quedaría cortado a un
        // tercio con una banda debajo.
        yearCalendarPanel(input),
        periodActivityPanel(input, period, filter),
        completedByYearPanel(input),
        hoursPanel(input),
        streaksPanel(input.streaks, "Rachas", input.itemFilter),
        recordsPanel(input.records, input.streaks, input.titles.records, period, filter),
      ],
    },
    {
      id: "habitos",
      title: "Hábitos",
      description: "A qué hora, qué día y con qué sesiones lo haces.",
      panels: [
        habitsPanel(input.habits, input.titles.habits, period, filter),
        sessionsPanel(input, period, filter),
        speedPanel(input, period),
        annotationsPanel(input, period),
      ],
    },
    {
      id: "biblioteca",
      title: "Biblioteca y estados",
      description: "Qué tienes, qué acabas y qué se te acumula.",
      panels: [
        statusPanel(input, filter),
        tbrPanel(input.tbr, input.titles.tbr, filter),
        libraryHealthPanel(input, period),
        dropReasonsPanel(input, period, filter),
        backlogPanel(input),
        dropPointPanel(input, period),
      ],
    },
    {
      id: "valoraciones",
      title: "Valoraciones",
      description: "Cómo puntúas y qué puntúas mejor.",
      // Los tres `ratedGroupPanel` NO van seguidos, y es a propósito: son el
      // mismo panel tres veces —mismo título, misma forma, misma frase de
      // vacío—, y en fila se leen como una repetición aunque hablen de cosas
      // distintas. Intercalados entre paneles de otra forma, cada uno se lee por
      // lo que dice.
      //
      // Colapsarlos en UNO con selector de faceta sería lo suyo, pero choca con
      // «nunca hay un filtro por panel» (`filter.ts`), así que se arregla por
      // forma y por orden. Queda su issue.
      panels: [
        // Va PRIMERO por ser el héroe de la sección, y héroe porque los títulos
        // de obra son largos y el salto entre dos notas se lee en el ancho: en
        // un tercio de tarjeta, «de 3,5 a 4,0» son doce píxeles de segmento.
        rereadsPanel(input),
        ratingPanel(input.rating, input.titles.rating, period, filter),
        ratedGroupPanel("nota-generos", "Géneros mejor valorados", "Género", input.facets.genres, period, filter),
        // Páginas y minutos no comparten eje, así que van en dos paneles; y con
        // un tipo elegido solo se pinta el suyo, o el otro saldría vacío al
        // lado sin más explicación que «sin datos».
        ...(input.itemFilter === "movie" || input.itemFilter === "series"
          ? []
          : [lengthVsRatingPanel(input, "book", period)]),
        ratedGroupPanel("nota-autores", "Autores mejor valorados", "Autor", input.facets.authors, period, filter),
        topRatedPanel(input, period),
        ratedGroupPanel("nota-directores", "Directores mejor valorados", "Director", input.facets.directors, period, filter),
        ...(input.itemFilter === "book"
          ? []
          : [lengthVsRatingPanel(input, "screen", period)]),
      ],
    },
    {
      id: "gustos",
      title: "Gustos y descubrimiento",
      description: "Qué eliges, de quién y de qué época.",
      panels: [
        genresPanel(input, period, filter),
        // Autores y editoriales solo existen en libros; la dirección, en
        // películas. Con el tipo contrario elegido saldrían vacíos y con un
        // rótulo que se contradice a sí mismo («Libros · Solo películas»).
        ...(input.itemFilter === "movie" || input.itemFilter === "series"
          ? []
          : [authorsPanel(input, period), publishersPanel(input, period)]),
        ...(input.itemFilter === "book" || input.itemFilter === "series"
          ? []
          : [directorsPanel(input, period)]),
        decadesPanel(input, period),
        discoveryPanel(input, period),
      ],
    },
    {
      id: "categoria",
      title: "Por categoría",
      description: "Lo que solo tiene sentido dentro de un tipo de obra.",
      // Estos tres NO obedecen al filtro de tipo: lo SON. Con un tipo elegido
      // se enseña solo el suyo — dejar los otros dos al lado, llenos de datos
      // de lo que el filtro dice haber excluido, es la contradicción más
      // ruidosa que puede tener la pantalla.
      panels: [
        ...(input.itemFilter === "all" || input.itemFilter === "book"
          ? [bookFormatPanel(input, period)]
          : []),
        ...(input.itemFilter === "all" || input.itemFilter === "movie"
          ? [movieFormatPanel(input, period)]
          : []),
        ...(input.itemFilter === "all" || input.itemFilter === "series"
          ? [seriesFormatPanel(input, period)]
          : []),
      ],
    },
  ];
}

// ══ Panel del perfil (pestaña Estadísticas) ══════════════════════════════════
// La vista corta del mismo esquema. Reutiliza los constructores del muro donde
// son el mismo dato —valoración, récords, la pila, hábitos, rachas— porque
// tienen que contarse igual en los dos sitios; lo propio de aquí es la semana,
// el objetivo diario y el ritmo.

export type ProfileTitles = {
  weekly: string;
  streak: string;
  pace: string;
  rating: string;
  tbr: string;
  habits: string;
};

export type ProfileInput = {
  period: StatsPeriod;
  metric: ActivityMetric;
  titles: ProfileTitles;
  weekly: DayActivity[];
  streaks: Streaks;
  pagesPerDay: number | null;
  rating: RatingDistribution;
  tbr: TbrSnapshot;
  habits: Habits;
  health: LibraryHealth;
  formats: FormatStats;
};

/**
 * Los paneles de la pestaña, EN EL ORDEN DEL ESQUEMA: qué has hecho · con qué
 * constancia · qué se te acumula · cómo puntúas · cuándo consumes.
 *
 * Tres tarjetas se fueron y conviene saber por qué, para que nadie las
 * reponga leyendo una maqueta vieja:
 *
 *  · «Actividad del periodo» contaba lo mismo que el calendario del mes, con
 *    otro dibujo. Dos gráficos que responden a la misma pregunta obligan a
 *    compararlos entre sí antes de poder leer ninguno.
 *  · El objetivo diario se mudó al Rincón, con los retos: es una meta que se
 *    edita, no una cifra que se lee.
 *  · «Récords» pedía un histórico. Con la pestaña fijada al MES, «tu mejor
 *    racha» y «el mes más activo» hablarían de treinta días, que no es un
 *    récord de nada. Sigue entero en /estadisticas, donde hay periodo.
 */
export function buildProfilePanels(input: ProfileInput): PanelSpec[] {
  const period = periodLabel(input.period);
  return [
    weeklyPanel(input.weekly, input.titles.weekly, input.metric),
    streaksPanel(input.streaks, input.titles.streak),
    pacePanel(input.pagesPerDay, input.titles.pace),
    profilePilaPanel(input, period),
    ratingPanel(input.rating, input.titles.rating, period, undefined),
    habitsPanel(input.habits, input.titles.habits, period, undefined),
  ];
}

/** El objetivo diario, que vive con los retos del Rincón y no con las cifras. */
export function buildDailyGoalPanel(
  weekly: DayActivity[],
  goalMinutes: number | null,
  title: string,
): PanelSpec {
  return dailyGoalPanel(weekly, goalMinutes, title);
}

// ── §1 Resumen general ────────────────────────────────────────────────────────

/**
 * Las cuatro cifras de cabecera. Es un panel de indicadores a propósito: mezclar
 * obras, minutos y estrellas en un gráfico exigiría tres ejes, y la regla de la
 * casa es que un panel tiene UNO.
 */
function summaryPanel(input: StatsInput, period: string): PanelSpec {
  const { activity, rating, hours } = input;
  const totalMinutes = hours.months.reduce((s, m) => s + m.minutes, 0);

  const kpis: PanelKpi[] = [
    {
      key: "obras",
      label: "Obras terminadas",
      value: activity.works,
      unit: UNITS.works,
      delta:
        activity.previousWorks === null
          ? undefined
          : {
              value: activity.works - activity.previousWorks,
              unit: UNITS.works,
              comparedTo: previousLabel(input.period),
              higherIsBetter: true,
            },
    },
    {
      key: "tiempo",
      label: "Tiempo registrado",
      value: activity.minutes,
      unit: UNITS.minutes,
      delta:
        activity.previousMinutes === null
          ? undefined
          : {
              value: activity.minutes - activity.previousMinutes,
              unit: UNITS.minutes,
              comparedTo: previousLabel(input.period),
              higherIsBetter: true,
            },
    },
    {
      key: "nota",
      label: "Nota media",
      value: rating.average,
      unit: UNITS.stars,
      hint: `Sobre ${rating.count} ${rating.count === 1 ? "obra valorada" : "obras valoradas"}`,
    },
    {
      key: "anual",
      label: `Horas registradas en ${hours.year}`,
      value: Math.round(totalMinutes / 60),
      unit: { short: "h", one: "hora", many: "horas" },
      hint: "El año natural completo, obedezca o no el periodo elegido",
    },
  ];

  return {
    id: "resumen-general",
    title: "Resumen",
    description:
      "Las cifras de cabecera del periodo. El tiempo solo cuenta sesiones con duración registrada, así que una película vista sin sesión suma obra pero no minutos.",
    context: {
      period,
      filter:
        input.itemFilter === "all" ? undefined : itemFilterLabel(input.itemFilter),
    },
    viz: "kpi",
    unit: UNITS.works,
    data: [],
    kpis,
    empty: {
      title: "Todavía no hay nada que resumir",
      message: "Cierra un pase o registra una sesión y estas cifras empiezan a moverse.",
    },
  };
}

// ── §2 Actividad ──────────────────────────────────────────────────────────────

/** Etiquetas del eje según el grano del periodo. */
function bucketLabels(
  bucket: ActivityBucket,
  grain: PeriodActivity["granularity"],
): { label: string; short: string } {
  if (grain === "year") return { label: bucket.key, short: bucket.key.slice(2) };
  if (grain === "month") {
    const month = Number(bucket.key.slice(5, 7));
    return {
      label: `${MONTHS[month - 1]} ${bucket.key.slice(0, 4)}`,
      short: MONTH_SHORT[month - 1],
    };
  }
  const day = Number(bucket.key.slice(8, 10));
  const month = Number(bucket.key.slice(5, 7));
  return { label: `${day} de ${MONTHS[month - 1].toLowerCase()}`, short: String(day) };
}

/**
 * «Actividad del periodo»: la evolución, en la magnitud elegida. Las dos
 * magnitudes salen de la misma consulta, así que alternarlas no cuesta otra
 * vuelta a la BD — solo cambia qué se lee de cada cubo.
 */
function activitySpec(
  activity: PeriodActivity,
  metric: ActivityMetric,
  id: string,
  title: string,
  period: string,
  previous: string,
  filter: string | undefined,
): PanelSpec {
  const time = metric === "time";
  const value = (b: ActivityBucket) => (time ? b.minutes : b.works);
  const total = time ? activity.minutes : activity.works;
  const before = time ? activity.previousMinutes : activity.previousWorks;

  return {
    id,
    title,
    description: time
      ? "Minutos de sesiones con duración registrada. Una obra terminada sin sesión no suma tiempo, aunque sí cuente como obra."
      : "Obras con el pase cerrado en el periodo. Releer cuenta como obra nueva: es un pase nuevo.",
    context: { period, filter },
    // Apilado solo cuando hay desglose que apilar: el tiempo no distingue tipo,
    // porque la sesión cuelga del pase pero los minutos no se reparten.
    viz: time ? "bars" : "stacked",
    unit: time ? UNITS.minutes : UNITS.works,
    labelHeader:
      activity.granularity === "day" ? "Día" : activity.granularity === "month" ? "Mes" : "Año",
    series: time
      ? [{ key: "minutes", label: "Minutos", color: "var(--accent)" }]
      : TYPE_SERIES,
    data: activity.buckets.map((b) => {
      const { label, short } = bucketLabels(b, activity.granularity);
      return {
        key: b.key,
        label,
        short,
        // Un cubo futuro NO vale cero: nadie lo ha medido todavía.
        value: b.future ? null : value(b),
        parts: time
          ? undefined
          : [
              { key: "book", value: b.book },
              { key: "movie", value: b.movie },
              { key: "series", value: b.series },
            ],
      };
    }),
    kpis: [
      {
        key: "total",
        label: time ? "Tiempo del periodo" : "Terminadas en el periodo",
        value: total,
        unit: time ? UNITS.minutes : UNITS.works,
        delta:
          before === null
            ? undefined
            : {
                value: total - before,
                unit: time ? UNITS.minutes : UNITS.works,
                comparedTo: previous,
                higherIsBetter: true,
              },
      },
    ],
    empty: {
      title: time ? "Sin tiempo registrado en el periodo" : "Nada terminado en el periodo",
      message: "Prueba a ampliar el periodo con el selector de arriba.",
    },
  };
}

function periodActivityPanel(
  input: StatsInput,
  period: string,
  filter: string | undefined,
): PanelSpec {
  const spec = activitySpec(
    input.activity,
    input.metric,
    "actividad-periodo",
    "Actividad del periodo",
    period,
    previousLabel(input.period),
    filter,
  );

  // La salida solo se ofrece con la medida en OBRAS: el histórico que hay a
  // mano (`byYear`) cuenta obras terminadas, y prometer «llevas 54 obras» en un
  // panel que está midiendo minutos sería cambiarle la unidad al lector sin
  // avisar. Con «Tiempo» puesto no hay cifra de fuera, así que no hay enlace.
  const ever = input.metric === "time" ? 0 : everFinishedTotal(input.byYear);
  return {
    ...spec,
    empty: spec.empty && {
      ...spec.empty,
      elsewhere: wayOutToAllTime(
        input,
        ever,
        `En todo el histórico llevas ${ever} ${ever === 1 ? "obra terminada" : "obras terminadas"}`,
      ),
    },
  };
}

/**
 * Disposición del mosaico anual: siete filas (una por día de la semana), una
 * columna por semana, y los rótulos de mes encima.
 *
 * El rótulo se coloca en la columna donde CAE EL DÍA 1 de cada mes, calculada
 * igual que la celda: `(índice del día + desplazamiento) / 7`. Repartir doce
 * etiquetas a ojo entre 53 columnas las desalinea un par de semanas, que es
 * justo el error que hace inútil un eje.
 */
function yearHeatmapLayout(calendar: YearCalendar): NonNullable<PanelSpec["heatmap"]> {
  const offset = mondayIndex(calendar.days[0]?.date ?? `${calendar.year}-01-01`);
  const columns = Math.ceil((calendar.days.length + offset) / 7);

  const months: { label: string; column: number }[] = [];
  calendar.days.forEach((day, i) => {
    if (!day.date.endsWith("-01")) return;
    const month = Number(day.date.slice(5, 7));
    const column = Math.floor((i + offset) / 7);
    // Enero suele empezar a media columna; su rótulo iría fuera de la rejilla.
    months.push({ label: MONTH_SHORT_NAMES[month - 1], column: Math.min(column, columns - 1) });
  });

  return { rows: 7, offset, columns, months };
}

/** Calendario anual: 365 celdas de intensidad. */
function yearCalendarPanel({ calendar, itemFilter }: StatsInput): PanelSpec {
  return {
    id: "calendario-anual",
    dataWindow: "long",
    title: "Calendario anual",
    description:
      "Un día «activo» es aquel en que registraste una sesión o terminaste algo, del tipo que sea. Ver una película sin sesión también pinta el día.",
    context: {
      period: String(calendar.year),
      scope: withAllTypes(itemFilter, "año natural"),
    },
    viz: "heatmap",
    // Preside su sección: 53 semanas en un tercio de tarjeta son celdas de 6 px.
    hero: true,
    // Siete filas, una por día de la semana; cada columna, una semana. El
    // desplazamiento es el día de la semana del 1 de enero: sin él las filas
    // dejarían de ser lunes, martes… y el mosaico no sería un calendario.
    heatmap: yearHeatmapLayout(calendar),
    unit: { short: "act.", one: "actividad", many: "actividades" },
    labelHeader: "Día",
    data: calendar.days.map((d) => ({
      key: d.date,
      label: `${Number(d.date.slice(8, 10))} de ${MONTHS[Number(d.date.slice(5, 7)) - 1].toLowerCase()}`,
      short: d.date.slice(8, 10),
      value: d.count,
    })),
    kpis: [
      {
        key: "activos",
        label: "Días activos",
        value: calendar.activeDays,
        unit: UNITS.days,
        hint: `De ${calendar.days.length} del año`,
      },
      {
        key: "pico",
        label: "Día más movido",
        value: null,
        text: calendar.busiest
          ? `${Number(calendar.busiest.date.slice(8, 10))} de ${MONTHS[Number(calendar.busiest.date.slice(5, 7)) - 1].toLowerCase()}`
          : undefined,
        hint: calendar.busiest
          ? `${calendar.busiest.count} ${calendar.busiest.count === 1 ? "actividad" : "actividades"}`
          : undefined,
      },
    ],
    note: "Cada columna es una semana y cada fila un día de la semana. Aquí, con el panel ampliado, los tres días más movidos llevan su cifra escrita; el resto se consulta apuntando a su celda o recorriéndolas con el tabulador. En la tarjeta cerrada el mosaico es demasiado pequeño para que esas cifras señalen un día concreto.",
    empty: {
      title: "Sin actividad este año",
      message: "Registra una sesión y el calendario empieza a encenderse.",
    },
  };
}

/** Rachas y días activos: la constancia, que no es lo mismo que el volumen. */
function streaksPanel(
  streaks: Streaks,
  title: string,
  itemFilter: ItemFilter = "all",
): PanelSpec {
  return {
    id: "racha",
    dataWindow: "snapshot",
    title,
    description:
      "Un día cuenta para la racha si registraste una sesión o terminaste algo. La racha son días SEGUIDOS; los días activos, sueltos.",
    // La racha es deliberadamente de TODOS los tipos: si no, una noche de cine
    // rompería la racha de quien tiene puesto «Libros», y no es cierto que ese
    // día no hiciera nada.
    context: {
      period: "Ahora mismo",
      scope: withAllTypes(itemFilter, "foto del momento"),
    },
    // Bullet y no tres cifras sueltas: «racha actual contra tu mejor racha» ES
    // valor-contra-referencia, que es exactamente lo que este gráfico dice. Con
    // tres números había que restarlos mentalmente para saber si estabas cerca.
    viz: "bullet",
    unit: UNITS.days,
    // Una sola fila basta: el bullet compara cada punto con SU marca, no con los
    // otros puntos. `target` se omite si no hay mejor racha todavía — dibujar
    // una marca en cero diría que ya la has batido.
    data: [
      {
        key: "actual",
        label: "Racha actual",
        value: streaks.current,
        target: streaks.best > 0 ? streaks.best : undefined,
      },
    ],
    kpis: [
      { key: "actual", label: "Días seguidos", value: streaks.current, unit: UNITS.days },
      {
        key: "mejor",
        label: "Tu mejor racha",
        value: streaks.best > 0 ? streaks.best : null,
        unit: UNITS.days,
      },
      {
        key: "activos",
        label: "Días activos",
        value: streaks.activeDays > 0 ? streaks.activeDays : null,
        unit: UNITS.days,
        hint: "En todo el histórico, seguidos o no",
      },
    ],
    empty: {
      title: "Sin racha en marcha",
      message: "Registra actividad dos días seguidos para arrancar una.",
    },
  };
}

/** Sesiones: cuántas, cuánto duran y a qué ritmo avanzan. */
function sessionsPanel(
  { habits, pagesPerDay }: StatsInput,
  period: string,
  filter: string | undefined,
): PanelSpec {
  const perDay =
    habits.activeDays > 0 ? Math.round((habits.sessions / habits.activeDays) * 10) / 10 : null;
  return {
    id: "sesiones",
    title: "Sesiones y ritmo",
    description:
      "La sesión media solo promedia las sesiones que traen duración; el recuento las cuenta todas. Por eso las dos cifras pueden no cuadrar.",
    context: { period, filter },
    viz: "kpi",
    unit: UNITS.sessions,
    data: [],
    kpis: [
      { key: "total", label: "Sesiones", value: habits.sessions || null, unit: UNITS.sessions },
      {
        key: "media",
        label: "Sesión media",
        value: habits.averageMinutes,
        unit: UNITS.minutes,
      },
      {
        key: "frecuencia",
        label: "Sesiones por día activo",
        value: perDay,
        unit: { short: "ses./día", one: "sesión", many: "sesiones", decimals: 1 },
        hint: `Sobre ${habits.activeDays} ${habits.activeDays === 1 ? "día con sesión" : "días con sesión"}`,
      },
      {
        key: "ritmo",
        label: "Páginas al día",
        value: pagesPerDay,
        unit: UNITS.pages,
        hint: "Solo libros: las series se miden en episodios",
      },
    ],
    empty: {
      title: "Sin sesiones en el periodo",
      message: "Registra una sesión con su duración para empezar a acumular.",
    },
  };
}

// ── Velocidad ─────────────────────────────────────────────────────────────────
/** Páginas por hora de lectura. No es `UNITS.pages`: el denominador es tiempo. */
const PAGES_PER_HOUR: Unit = {
  short: "págs./h",
  one: "página por hora",
  many: "páginas por hora",
};

/**
 * Velocidad real: páginas por HORA, no por día.
 *
 * «Páginas al día» (en «Sesiones y ritmo») divide por días distintos, así que
 * mezcla una sesión de tres horas con una de diez minutos: contesta a cuánto
 * avanzas al día, que es constancia. Esta contesta a a qué velocidad lees.
 *
 * La marca de cada barra es TU media, la misma para todas: la pregunta del panel
 * es qué libros te frenan y cuáles vuelan, y eso solo se ve contra tu propio
 * ritmo. Compararlos entre sí ya lo hace la escala común.
 */
function speedPanel({ speed }: StatsInput, period: string): PanelSpec {
  const media = speed.pagesPerHour;
  return {
    id: "velocidad",
    title: "A qué velocidad lees",
    description:
      "Páginas por hora de lectura, solo con sesiones que traen duración. La primera sesión de un pase únicamente fija el cursor: quien empieza a registrar por la página 300 no ha leído 300 páginas en esa sesión.",
    context: { period, filters: ["Solo libros", "Solo sesiones cronometradas"] },
    viz: "bullet",
    targetName: "tu media",
    unit: PAGES_PER_HOUR,
    labelHeader: "Obra",
    data: speed.works.slice(0, RANK_LIMIT).map((w) => ({
      key: w.itemId,
      label: w.title ?? "",
      value: w.pagesPerHour,
      target: media ?? undefined,
      detail: `${w.pages} págs. en ${w.minutes} min`,
    })),
    kpis: [
      {
        key: "media",
        label: "Tu velocidad",
        value: media,
        unit: PAGES_PER_HOUR,
        hint: "Sobre el tiempo de las sesiones cronometradas",
      },
    ],
    note:
      speed.withoutDuration > 0
        ? `${speed.withoutDuration} ${speed.withoutDuration === 1 ? "avance no cuenta" : "avances no cuentan"} por no traer duración la sesión que lo cerró. Sin decirlo, esta velocidad parecería la de toda tu lectura.`
        : undefined,
    empty: {
      title: "Todavía no hay ninguna sesión cronometrada",
      message: "Registra una sesión con su duración y su página para medir tu ritmo.",
    },
  };
}

// ── Anotación ─────────────────────────────────────────────────────────────────
/**
 * Unidad propia. Va aquí y no en `UNITS` porque solo la usa este panel: meterla
 * en el catálogo compartido invitaría a reutilizarla donde el denominador no son
 * cien páginas.
 */
const PER_100_PAGES: Unit = {
  short: "por 100 págs.",
  one: "anotación por cada cien páginas",
  many: "anotaciones por cada cien páginas",
  decimals: 1,
};

/**
 * Las obras que más te hacen escribir.
 *
 * **Normaliza por cada cien páginas y no por obra**, que es toda la diferencia:
 * sin normalizar sería un ranking de libros largos. Doce notas en un tocho de mil
 * páginas es menos escritura que cuatro en uno de cien.
 */
function annotationsPanel({ annotations }: StatsInput, period: string): PanelSpec {
  const a = annotations;
  return {
    id: "anotacion",
    title: "Las obras que más te hacen escribir",
    description:
      "Notas y citas por cada cien páginas, no por obra: sin normalizar, esto sería un ranking de libros largos.",
    context: { period, filters: ["Solo libros con páginas en ficha"] },
    viz: "lollipop",
    unit: PER_100_PAGES,
    labelHeader: "Obra",
    data: a.works.slice(0, RANK_LIMIT).map((w) => ({
      key: `${w.type}:${w.itemId}`,
      label: w.title ?? "",
      value: w.per100,
      detail: `${w.count} en ${w.totalPages} págs.`,
    })),
    kpis: [
      {
        key: "citas",
        label: "Citas",
        value: a.quotes || null,
        unit: { short: "citas", one: "cita", many: "citas" },
        hint: "Lo que dice el libro, copiado",
      },
      {
        key: "notas",
        label: "Notas",
        value: a.notes || null,
        unit: { short: "notas", one: "nota", many: "notas" },
        hint: "Lo tuyo sobre el libro",
      },
    ],
    note:
      a.unmeasurable > 0
        ? `${a.unmeasurable} ${a.unmeasurable === 1 ? "anotación queda" : "anotaciones quedan"} fuera del gráfico: son de una obra sin páginas en ficha, o de una película o serie, que no tienen contra qué normalizarse. Siguen contando en las cifras de arriba.`
        : undefined,
    empty: {
      title: "Todavía no has anotado nada",
      message: "Guarda una nota o una cita desde la ficha de un libro y aparecerá aquí.",
    },
  };
}

// ── §4 Biblioteca y estados ───────────────────────────────────────────────────

function libraryHealthPanel({ health, itemFilter }: StatsInput, period: string): PanelSpec {
  return {
    id: "salud-biblioteca",
    dataWindow: "snapshot",
    title: "Cuánto acabas",
    description:
      "Las tasas se calculan sobre lo CERRADO —terminadas más abandonadas—, no sobre la biblioteca entera: si contaran los pendientes, añadir un libro bajaría tu tasa sin que hayas dejado nada a medias.",
    context: {
      period: "Ahora mismo",
      scope: "foto del momento",
      filter: itemFilter === "all" ? undefined : itemFilterLabel(itemFilter),
    },
    viz: "kpi",
    unit: UNITS.percent,
    data: [],
    kpis: [
      {
        key: "final",
        label: "Tasa de finalización",
        value: health.completionRate,
        unit: UNITS.percent,
      },
      {
        key: "abandono",
        label: "Tasa de abandono",
        value: health.dropRate,
        unit: UNITS.percent,
        delta: undefined,
      },
      {
        key: "espera",
        label: "Espera mediana de la pila",
        value: health.medianWaitMonths,
        unit: { short: "meses", one: "mes", many: "meses" },
        hint: "La mitad lleva más; la otra mitad, menos",
      },
      {
        key: "balance",
        label: `Balance del periodo (${period.toLowerCase()})`,
        value: health.added - health.finished,
        unit: UNITS.items,
        hint: `${health.added} añadidas · ${health.finished} terminadas`,
      },
    ],
    note: "Las abandonadas no tienen fecha de abandono en el esquema, así que la tasa las cuenta pero no se puede saber CUÁNDO se abandonaron.",
    empty: {
      title: "Todavía no hay nada cerrado",
      message: "Termina o abandona algo y aquí aparecerá tu proporción.",
    },
  };
}

/**
 * La curva de la pila. Cada punto es un STOCK —cuántas obras había abiertas al
 * cerrar ese mes—, no un flujo, y de ahí sale su única trampa: **esta serie no
 * se suma**. El indicador que fabrica el armazón por defecto es el total, y
 * sumar doce fotos del inventario da un número que no significa nada (una obra
 * abierta todo el año se contaría doce veces). Preside el ÚLTIMO punto, que es
 * la pregunta de verdad —«¿cuántas tengo abiertas ahora?»— con su variación
 * contra el primer mes de la serie.
 */
function backlogPanel({ health, itemFilter }: StatsInput): PanelSpec {
  const last = health.backlog[health.backlog.length - 1] ?? null;
  const first = health.backlog[0] ?? null;
  const monthName = (month: string) =>
    `${MONTHS[Number(month.slice(5, 7)) - 1].toLowerCase()} de ${month.slice(0, 4)}`;
  return {
    id: "backlog",
    dataWindow: "long",
    title: "Evolución de la pila",
    description:
      "Obras abiertas al cierre de cada mes: creadas ya y todavía sin terminar. Las abandonadas quedan fuera de la serie entera — sin fecha de abandono, contarlas las dejaría abiertas para siempre y la curva subiría sola.",
    context: {
      period: "Últimos 12 meses",
      scope: "serie histórica",
      filter: globalFilter(itemFilter),
    },
    viz: "line",
    // NO es héroe, aunque el diseño lo barajó: doce puntos de línea se leen bien
    // en un tercio de tarjeta, y ser héroe obliga a ir primero en la sección —
    // lo que rompería el orden que su descripción promete («qué tienes, qué
    // acabas y qué se te acumula»). El ancho se reserva para lo que no cabe.
    unit: UNITS.items,
    labelHeader: "Mes",
    series: [{ key: "pending", label: "Abiertas", color: "var(--status-planned)" }],
    data: health.backlog.map((b) => ({
      key: b.month,
      label: `${MONTHS[Number(b.month.slice(5, 7)) - 1]} ${b.month.slice(0, 4)}`,
      short: MONTH_SHORT[Number(b.month.slice(5, 7)) - 1],
      value: b.pending,
    })),
    kpis: last
      ? [
          {
            key: "ahora",
            label: `Abiertas al cerrar ${monthName(last.month)}`,
            value: last.pending,
            unit: UNITS.items,
            delta:
              first && first !== last
                ? {
                    value: last.pending - first.pending,
                    unit: UNITS.items,
                    comparedTo: monthName(first.month),
                  }
                : undefined,
          },
        ]
      : undefined,
    summary: last
      ? `Al cerrar ${monthName(last.month)} quedaban ${formatWorks(last.pending, "título", "títulos")} abiertos. Cada punto es cuántos había abiertos ESE mes, no cuántos se añadieron: la serie no se suma.`
      : undefined,
    empty: {
      title: "Sin historial suficiente",
      message: "Hace falta al menos un pase para dibujar la evolución.",
    },
  };
}

/** «3 títulos» / «1 título». Concordancia a mano: el repo es mono-idioma. */
function formatWorks(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/**
 * La pila del perfil: el saldo Y el inventario en UN panel.
 *
 * Antes eran dos tarjetas —«La pila» (anillo de pendientes) y «Entra y sale»
 * (tres cifras sueltas)— que solo se entendían juntas: la segunda decía si la
 * primera sube o baja, y para saberlo había que mirar a otro sitio. Aquí las
 * tres columnas comparten eje y unidad, así que el saldo se ve sin restar.
 *
 * Y las tres van DESGLOSADAS POR TIPO, que es la pregunta que quedaba fuera:
 * un mes de «+4» puede ser cuatro libros que no vas a abrir o cuatro películas
 * de dos horas, y no es lo mismo para nada.
 *
 * Mezcla una foto (lo pendiente AHORA) con dos flujos (lo que se movió en el
 * periodo). Comparten unidad —títulos—, así que el eje es honesto, pero el
 * rótulo tiene que decirlo o la primera columna parecería del mes también.
 */
function profilePilaPanel(input: ProfileInput, period: string): PanelSpec {
  const { tbr, health, formats, titles } = input;
  const net = health.added - health.finished;
  const netLabel =
    net > 0 ? "La pila crece" : net < 0 ? "La pila baja" : "La pila se mantiene";

  const lower = period.toLowerCase();

  return {
    id: "pila",
    title: titles.tbr,
    description:
      "Lo que tienes pendiente ahora mismo, y lo que entró y salió en el periodo. El movimiento ordena por fecha de creación del pase, no por `planned_on`: esa fecha solo existe hacia delante y el historial importado la tiene vacía.",
    context: { period, scope: "la pila, foto del momento" },
    viz: "stacked",
    unit: UNITS.items,
    labelHeader: "Columna",
    series: TYPE_SERIES,
    data: [
      {
        key: "pendiente",
        label: "Pendientes ahora mismo",
        short: "Pila",
        value: tbr.pending,
        parts: [
          { key: "book", value: tbr.byType.book },
          { key: "movie", value: tbr.byType.movie },
          { key: "series", value: tbr.byType.series },
        ],
      },
      {
        key: "entra",
        label: `Añadidas ${lower}`,
        short: "Entra",
        value: health.added,
        parts: [
          { key: "book", value: health.addedByType.book },
          { key: "movie", value: health.addedByType.movie },
          { key: "series", value: health.addedByType.series },
        ],
      },
      {
        key: "sale",
        label: `Terminadas ${lower}`,
        short: "Sale",
        value: health.finished,
        parts: [
          { key: "book", value: health.finishedByType.book },
          { key: "movie", value: health.finishedByType.movie },
          { key: "series", value: health.finishedByType.series },
        ],
      },
    ],
    kpis: [
      { key: "pendientes", label: "Pendientes", value: tbr.pending, unit: UNITS.items },
      { key: "neto", label: netLabel, value: Math.abs(net) || 0, unit: UNITS.items },
      {
        key: "tiempo",
        label: "Películas pendientes",
        value: formats.movies.pendingMinutes,
        unit: UNITS.minutes,
        hint: "Los libros no entran: sus páginas no son minutos",
      },
    ],
    note: [
      "La primera columna es una foto de AHORA; las otras dos, el movimiento del periodo. Por eso «Entra» y «Sale» pueden sumar más que la pila entera.",
      tbr.oldest
        ? `Lo que más lleva esperando: «${tbr.oldest.title}», ${tbr.oldest.monthsWaiting} ${
            tbr.oldest.monthsWaiting === 1 ? "mes" : "meses"
          } en la pila.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
    empty: {
      title: "No tienes nada pendiente ni movimiento en el periodo",
      message: "Cuando marques algo como pendiente, aparecerá aquí.",
    },
  };
}

// ── §5 Valoraciones ───────────────────────────────────────────────────────────

/** Ranking de nota media por faceta (género, autor, director). */
function ratedGroupPanel(
  id: string,
  title: string,
  labelHeader: string,
  groups: RatedGroup[],
  period: string,
  filter: string | undefined,
): PanelSpec {
  return {
    id,
    title,
    description:
      "Solo entran los nombres con dos obras valoradas o más. Con una sola, el ranking premiaría el acierto de una prueba, no un gusto.",
    context: { period, filter, filters: ["Mínimo 2 obras valoradas"] },
    viz: "lollipop",
    unit: UNITS.stars,
    labelHeader,
    valueHeader: "Nota",
    data: groups.slice(0, RANK_LIMIT).map((g) => ({
      key: g.name,
      label: g.name,
      value: Math.round(g.average * 10) / 10,
      detail: `${g.works} ${g.works === 1 ? "obra" : "obras"}`,
    })),
    empty: {
      title: "Sin suficientes obras valoradas",
      message: "Hacen falta al menos dos obras valoradas del mismo nombre.",
    },
  };
}

/**
 * ¿Puntúas mejor lo largo? Se responde por TRAMOS, no con una nube de puntos:
 * la media de cada tramo contesta la pregunta directamente, y una nube de
 * cuarenta puntos obliga a estimar una tendencia a ojo.
 */
function lengthVsRatingPanel(
  { facets }: StatsInput,
  kind: "book" | "screen",
  period: string,
): PanelSpec {
  const isBook = kind === "book";
  const rows = facets.lengthVsRating.filter((r) =>
    isBook ? r.type === "book" : r.type !== "book",
  );
  const edges = isBook ? [200, 400, 600] : [90, 120, 150];
  const unitShort = isBook ? "págs." : "min";
  const labels = [
    `Menos de ${edges[0]} ${unitShort}`,
    `${edges[0]}–${edges[1]} ${unitShort}`,
    `${edges[1]}–${edges[2]} ${unitShort}`,
    `Más de ${edges[2]} ${unitShort}`,
  ];

  const sums = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  for (const r of rows) {
    const i = r.length < edges[0] ? 0 : r.length < edges[1] ? 1 : r.length < edges[2] ? 2 : 3;
    sums[i] += r.star;
    counts[i] += 1;
  }

  return {
    id: isBook ? "duracion-nota-libros" : "duracion-nota-pantalla",
    title: isBook ? "Nota según extensión" : "Nota según duración",
    description: isBook
      ? "Nota media de los libros valorados, por tramos de páginas. Solo entran los que traen extensión en su ficha."
      : "Nota media de películas y series valoradas, por tramos de minutos. Solo entran las que traen duración en su ficha.",
    context: { period, filters: [isBook ? "Solo libros" : "Solo pantalla"] },
    viz: "bars",
    unit: UNITS.stars,
    labelHeader: "Tramo",
    valueHeader: "Nota media",
    series: [
      { key: "nota", label: "Nota media", color: isBook ? "var(--type-book)" : "var(--type-movie)" },
    ],
    data: labels.map((label, i) => ({
      key: label,
      label,
      short: i === 0 ? `<${edges[0]}` : i === 3 ? `>${edges[2]}` : String(edges[i - 1]),
      // Un tramo sin ninguna obra NO vale cero estrellas: no hay medida.
      value: counts[i] > 0 ? Math.round((sums[i] / counts[i]) * 10) / 10 : null,
      detail: `${counts[i]} ${counts[i] === 1 ? "obra" : "obras"}`,
    })),
    note: "Un tramo vacío sale como «sin datos», no como cero estrellas.",
    empty: {
      title: "Sin obras valoradas con esa medida",
      message: "La extensión y la duración salen de la ficha de catálogo, y muchas no la traen.",
    },
  };
}

// ── §6 Gustos y descubrimiento ────────────────────────────────────────────────

function directorsPanel({ catalog, itemFilter, byYear }: StatsInput, period: string): PanelSpec {
  return {
    id: "directores",
    title: "Directores más vistos",
    structurallyEmpty: everFinished(byYear, "movie") ? undefined : NEVER_MOVIES,
    context: {
      period,
      filter: globalFilter(itemFilter),
      filters: ["Solo películas", "Obras distintas"],
    },
    viz: "lollipop",
    unit: UNITS.works,
    labelHeader: "Director",
    data: catalog.directors.slice(0, RANK_LIMIT).map((d) => ({
      key: d.name,
      label: d.name,
      value: d.works,
    })),
    note: "La dirección sale del campo `director` de la ficha, que trae una sola persona: los codirigidos cuentan solo al primero.",
    empty: {
      title: "Sin directores en este periodo",
      message: "Termina una película con dirección en su ficha para que aparezca.",
    },
  };
}

function publishersPanel({ catalog, itemFilter, byYear }: StatsInput, period: string): PanelSpec {
  return {
    id: "editoriales",
    title: "Editoriales",
    structurallyEmpty: everFinished(byYear, "book") ? undefined : NEVER_BOOKS,
    context: {
      period,
      filter: globalFilter(itemFilter),
      filters: ["Solo libros", "Obras distintas"],
    },
    viz: "lollipop",
    unit: UNITS.works,
    labelHeader: "Editorial",
    data: catalog.publishers.slice(0, RANK_LIMIT).map((p) => ({
      key: p.name,
      label: p.name,
      value: p.works,
    })),
    note: "La editorial es la de la OBRA, no la de la edición que registraste: si leíste otro sello, aquí no se nota.",
    empty: {
      title: "Sin editoriales que mostrar",
      message: "La editorial sale de la ficha del libro, y muchas no la traen.",
    },
  };
}

/** Descubrimiento: cuántos nombres del periodo eran nuevos. */
function discoveryPanel(
  { catalog, records, period: raw, itemFilter }: StatsInput,
  period: string,
): PanelSpec {
  const isAll = raw === "all";
  return {
    id: "descubrimiento",
    title: "Descubrimiento",
    description: isAll
      ? "Con el periodo en «todo» no hay un «antes», así que todos los nombres cuentan como nuevos."
      : "Un nombre es nuevo si no aparece en nada terminado ANTES del periodo.",
    context: { period, filter: globalFilter(itemFilter) },
    viz: "kpi",
    unit: UNITS.authors,
    data: [],
    kpis: [
      {
        key: "autores",
        label: "Autores nuevos",
        value: catalog.authorFacet.discovered || null,
        unit: UNITS.authors,
        hint: `De ${catalog.authorFacet.total} ${catalog.authorFacet.total === 1 ? "autor leído" : "autores leídos"}`,
      },
      {
        key: "directores",
        label: "Directores nuevos",
        value: catalog.directorFacet.discovered || null,
        unit: UNITS.authors,
        hint: `De ${catalog.directorFacet.total} ${catalog.directorFacet.total === 1 ? "director visto" : "directores vistos"}`,
      },
      {
        key: "revisitas",
        label: "Revisitas",
        value: records.rereads,
        unit: UNITS.passes,
        hint: "Pases que no son el primero de su obra",
      },
    ],
    empty: {
      title: "Nada que descubrir todavía",
      message: "Termina algo con autor o dirección en su ficha.",
    },
  };
}

// ── §7 Por categoría ──────────────────────────────────────────────────────────

/** Nota al pie sobre cuántas obras se quedaron sin talla en la ficha. */
function coverageNote(known: number, unknown: number, what: string): string | undefined {
  if (unknown === 0) return undefined;
  const total = known + unknown;
  return `Se mide sobre ${known} de ${total}: ${unknown} ${
    unknown === 1 ? "no trae" : "no traen"
  } ${what} en su ficha de catálogo. Las medias son de las que sí.`;
}

function bookFormatPanel({ formats, pagesPerDay, byYear }: StatsInput, period: string): PanelSpec {
  const b = formats.books;
  const known = b.finished - b.unknown;
  const daysToEmpty =
    b.pendingPages !== null && pagesPerDay ? Math.round(b.pendingPages / pagesPerDay) : null;

  return {
    id: "libros-formato",
    title: "Libros",
    structurallyEmpty: everFinished(byYear, "book") ? undefined : NEVER_BOOKS,
    context: { period, filters: ["Solo libros"] },
    viz: "kpi",
    unit: UNITS.pages,
    data: [],
    kpis: [
      { key: "paginas", label: "Páginas leídas", value: b.pagesRead, unit: UNITS.pages },
      { key: "media", label: "Extensión media", value: b.averagePages, unit: UNITS.pages },
      {
        key: "largo",
        label: "El más largo",
        value: null,
        text: b.longest?.title,
        hint: b.longest ? `${b.longest.value} páginas` : undefined,
      },
      {
        key: "corto",
        label: "El más corto",
        value: null,
        text: b.shortest?.title,
        hint: b.shortest ? `${b.shortest.value} páginas` : undefined,
      },
      {
        key: "ritmo",
        label: "Ritmo",
        value: pagesPerDay,
        unit: UNITS.pages,
        hint: "Páginas por día con sesión",
      },
      {
        key: "vaciar",
        label: "Vaciar la pila de libros",
        value: daysToEmpty,
        unit: UNITS.days,
        hint:
          b.pendingPages !== null
            ? `${b.pendingPages} páginas pendientes a tu ritmo actual`
            : "Hace falta saber tu ritmo y las páginas de lo pendiente",
      },
    ],
    note: coverageNote(known, b.unknown, "número de páginas"),
    empty: {
      title: "Sin libros terminados en el periodo",
      message: "Cierra el pase de un libro para que aparezcan sus páginas.",
    },
  };
}

function movieFormatPanel({ formats, byYear }: StatsInput, period: string): PanelSpec {
  const m = formats.movies;
  const known = m.finished - m.unknown;
  return {
    id: "peliculas-formato",
    title: "Películas",
    structurallyEmpty: everFinished(byYear, "movie") ? undefined : NEVER_MOVIES,
    context: { period, filters: ["Solo películas"] },
    viz: "kpi",
    unit: UNITS.minutes,
    data: [],
    kpis: [
      { key: "minutos", label: "Minutos vistos", value: m.minutesWatched, unit: UNITS.minutes },
      { key: "media", label: "Duración media", value: m.averageMinutes, unit: UNITS.minutes },
      {
        key: "larga",
        label: "La más larga",
        value: null,
        text: m.longest?.title,
        hint: m.longest ? `${m.longest.value} minutos` : undefined,
      },
      {
        key: "corta",
        label: "La más corta",
        value: null,
        text: m.shortest?.title,
        hint: m.shortest ? `${m.shortest.value} minutos` : undefined,
      },
      {
        key: "pendiente",
        label: "Pendiente por ver",
        value: m.pendingMinutes,
        unit: UNITS.minutes,
        hint: "Duración de las películas de la pila",
      },
    ],
    note: coverageNote(known, m.unknown, "duración"),
    empty: {
      title: "Sin películas terminadas en el periodo",
      message: "Cierra el pase de una película para que sumen sus minutos.",
    },
  };
}

function seriesFormatPanel({ formats }: StatsInput, period: string): PanelSpec {
  const s = formats.series;
  return {
    id: "series-formato",
    title: "Series",
    description:
      "Las series no llevan sesiones: se miden en episodios vistos. Una temporada cuenta como completa cuando has visto tantos episodios como tiene en el catálogo — y si el catálogo de esa temporada no está cacheado, no se afirma nada.",
    context: { period, filters: ["Solo series"] },
    viz: "kpi",
    unit: UNITS.episodes,
    data: [],
    kpis: [
      { key: "episodios", label: "Episodios vistos", value: s.episodes || null, unit: UNITS.episodes },
      {
        key: "temporadas",
        label: "Temporadas completadas",
        value: s.seasonsCompleted || null,
        unit: UNITS.seasons,
      },
      {
        key: "maraton",
        label: "Días de maratón",
        value: s.marathonDays || null,
        unit: UNITS.days,
        hint: "Días con 3 episodios o más",
      },
      {
        key: "hueco",
        label: "Días entre episodios",
        value: s.averageGapDays,
        unit: UNITS.days,
        hint: "Media dentro de una misma serie",
      },
      { key: "curso", label: "Series en curso", value: s.active || null, unit: UNITS.items },
      {
        key: "restante",
        label: "Para ponerte al día",
        value: s.remainingMinutes,
        unit: UNITS.minutes,
        hint:
          s.remainingEpisodes !== null
            ? `${s.remainingEpisodes} episodios pendientes de las series en curso`
            : "Hace falta que la ficha traiga total de episodios y duración",
      },
      { key: "abandonadas", label: "Abandonadas", value: s.dropped || null, unit: UNITS.items },
    ],
    empty: {
      title: "Sin episodios en el periodo",
      message: "Marca un episodio como visto para que empiecen a contar.",
    },
  };
}

// ── Actividad de los últimos 7 días ───────────────────────────────────────────
/**
 * La semana, en la magnitud elegida. Es el panel al que obedece el conmutador
 * obras/tiempo en el perfil, desde que la pestaña se quedó fija en el mes y
 * «Actividad del periodo» se fue.
 *
 * Las dos magnitudes NO son la misma serie en otra escala: los minutos solo
 * los llevan las sesiones de lectura, y las obras cuentan cualquier pase que
 * cierres. Un domingo de cine sale a cero en tiempo y a dos en obras, y las
 * dos cosas son ciertas.
 */
function weeklyPanel(
  days: DayActivity[],
  title: string,
  metric: ActivityMetric,
): PanelSpec {
  const time = metric === "time";
  return {
    id: "semana",
    title,
    description: time
      ? "Minutos de sesiones de lectura con duración registrada. Solo los libros llevan sesión: una película vista no suma minutos aquí."
      : "Obras con el pase cerrado cada día, del tipo que sea. Algo terminado sin sesión sí cuenta aquí, aunque no sume ni un minuto.",
    context: { period: "Últimos 7 días", scope: "ventana móvil" },
    // Apilado solo cuando hay desglose que apilar: los minutos no distinguen
    // tipo, porque la sesión cuelga del pase pero el tiempo no se reparte.
    viz: time ? "bars" : "stacked",
    unit: time ? UNITS.minutes : UNITS.works,
    labelHeader: "Día",
    series: time
      ? [{ key: "minutes", label: "Minutos", color: "var(--accent)" }]
      : TYPE_SERIES,
    data: days.map((d) => ({
      key: d.date,
      label: `${weekdayName(d.date)} ${Number(d.date.slice(8, 10))}`,
      short: weekdayShort(d.date),
      value: time ? d.minutes : d.works,
      parts: time
        ? undefined
        : [
            { key: "book", value: d.byType.book },
            { key: "movie", value: d.byType.movie },
            { key: "series", value: d.byType.series },
          ],
    })),
    note: time
      ? "Ventana móvil de siete días que termina hoy, no la semana natural. Solo cuenta minutos de sesiones de lectura con duración registrada."
      : "Ventana móvil de siete días que termina hoy, no la semana natural.",
    empty: {
      title: "Sin actividad esta semana",
      message: time
        ? "Registra una sesión y la semana empieza a llenarse."
        : "Cierra un pase y la semana empieza a llenarse.",
    },
  };
}

// ── Medidor de progreso ───────────────────────────────────────────────────────
function dailyGoalPanel(
  days: DayActivity[],
  goalMinutes: number | null,
  title: string,
): PanelSpec {
  const today = days[days.length - 1];
  return {
    id: "objetivo-hoy",
    title,
    context: { period: "Hoy" },
    viz: "gauge",
    unit: UNITS.minutes,
    target: goalMinutes,
    labelHeader: "Día",
    data: today ? [{ key: today.date, label: "Hoy", value: today.minutes }] : [],
    kpis: today
      ? [
          {
            key: "hoy",
            label: goalMinutes ? `De ${goalMinutes} minutos` : "Acumulado hoy",
            value: today.minutes,
            unit: UNITS.minutes,
          },
        ]
      : undefined,
    note: goalMinutes
      ? "El objetivo es de MINUTOS. Páginas, películas o episodios no tienen objetivo propio todavía."
      : "No tienes objetivo diario configurado, así que aquí solo se acumula el tiempo del día.",
    empty: {
      title: "Todavía no hay tiempo registrado hoy",
      message: "Registra una sesión para ver cuánto llevas.",
    },
  };
}

function pacePanel(pagesPerDay: number | null, title: string): PanelSpec {
  return {
    id: "ritmo",
    title,
    context: { period: "Todo el histórico", filters: ["Solo libros"] },
    viz: "kpi",
    unit: UNITS.pages,
    data: [],
    kpis: [
      {
        key: "ritmo",
        label: "Páginas al día",
        value: pagesPerDay,
        unit: UNITS.pages,
        hint: "Media sobre los días con sesión registrada",
      },
    ],
    empty: {
      title: "Aún no se puede calcular tu ritmo",
      message: "Hacen falta sesiones de lectura con páginas registradas.",
    },
  };
}

/** Índice lunes=0 de una fecha ISO. Se parsea a mano, como el resto del repo. */
function mondayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function weekdayName(iso: string): string {
  return WEEKDAYS[mondayIndex(iso)];
}

function weekdayShort(iso: string): string {
  return WEEKDAY_INITIALS[mondayIndex(iso)];
}

// ── Comparativa entre periodos ────────────────────────────────────────────────
function completedByYearPanel({ byYear, titles, itemFilter }: StatsInput): PanelSpec {
  const current = byYear[byYear.length - 1];
  const prev = byYear.length > 1 ? byYear[byYear.length - 2] : null;
  return {
    id: "completadas-por-anio",
    dataWindow: "long",
    title: titles.completedByYear,
    context: {
      period: "Todos los años con actividad",
      // La serie histórica se lee entera, sin filtro de tipo: su desglose por
      // color YA distingue libros, películas y series.
      scope: withAllTypes(itemFilter, "serie histórica"),
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

/** Mediana y moda desde los diez cubos del histograma (medias estrellas). */
function ratingShape(rating: RatingDistribution): { median: number | null; mode: number | null } {
  if (rating.count === 0) return { median: null, mode: null };
  const ascending = [...rating.buckets].sort((a, b) => a.star - b.star);
  let mode: number | null = null;
  let best = 0;
  let seen = 0;
  let median: number | null = null;
  const middle = rating.count / 2;
  for (const b of ascending) {
    if (b.count > best) {
      best = b.count;
      mode = b.star;
    }
    seen += b.count;
    if (median === null && seen >= middle) median = b.star;
  }
  return { median, mode };
}

function ratingPanel(
  rating: RatingDistribution,
  title: string,
  period: string,
  filter: string | undefined,
): PanelSpec {
  const { median, mode } = ratingShape(rating);
  return {
    id: "valoraciones",
    title,
    description:
      "La nota interna va de 1 a 10 y se muestra en escala de 5, así que cada punto interno es MEDIA estrella y el histograma tiene diez columnas. Un pase sin nota no entra en la media. Media, mediana y moda se leen en la misma escala: si la media dice 3,5, hay una columna en 3,5.",
    context: { period, filter, filters: ["Solo pases con nota"] },
    viz: "bars",
    unit: UNITS.works,
    labelHeader: "Nota",
    valueHeader: "Obras",
    series: [{ key: "count", label: "Obras", color: "var(--gold)" }],
    // Los buckets llegan de 5★ a 0,5★; el eje se lee mejor de menos a más.
    data: [...rating.buckets]
      .sort((a, b) => a.star - b.star)
      .map((b) => ({
        key: starLabel(b.star),
        label: `${starLabel(b.star)} ${b.star === 1 ? "estrella" : "estrellas"}`,
        // Un decimal SIEMPRE, también en las enteras: con «1» al lado de «1,5»
        // las diez etiquetas del eje bailan de ancho y dejan de leerse como
        // una escala.
        short: starLabel(b.star),
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
      { key: "mediana", label: "Mediana", value: median, unit: UNITS.stars },
      {
        key: "moda",
        label: "Nota más repetida",
        value: mode,
        unit: UNITS.stars,
        hint: "La barra más alta del histograma",
      },
    ],
    empty: {
      title: "Aún no has valorado nada",
      message: "Pon una nota al cerrar un pase y aquí verás tu media y el reparto.",
    },
  };
}

// ── Ranking ───────────────────────────────────────────────────────────────────
function topRatedPanel({ topRated, titles, itemFilter }: StatsInput, period: string): PanelSpec {
  const typeLabel: Record<TopRatedItem["type"], string> = {
    book: "Libro",
    movie: "Película",
    series: "Serie",
  };
  return {
    id: "mejor-valoradas",
    title: titles.topRated,
    context: {
      period,
      filter: globalFilter(itemFilter),
      filters: ["Ordenado por nota, de mayor a menor"],
    },
    viz: "lollipop",
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

// ── Relecturas ────────────────────────────────────────────────────────────────
/**
 * Cómo cambia tu nota al releer.
 *
 * El esquema lleva esto desde el principio —el pase es dueño de la nota, así que
 * cada relectura tiene la suya— y lo único que se sacaba de ahí era un contador.
 *
 * **Ignora el selector de periodo a propósito**: una relectura son dos pases
 * separados por años, y recortarlos a la ventana elegida dejaría fuera justo el
 * primero, que es la mitad de la comparación. Lo dice en su alcance.
 */
function rereadsPanel(input: StatsInput): PanelSpec {
  const { rereads, itemFilter } = input;
  const works = rereads.works.slice(0, RANK_LIMIT);
  const subieron = rereads.works.filter((w) => w.change > 0).length;

  return {
    id: "relecturas",
    dataWindow: "long",
    // Héroe SOLO cuando hay algo que dibujar. Una tarjeta vacía ocupando las tres
    // columnas es el peor sitio del muro para no tener datos, y encima obliga a
    // ir primera.
    ...(works.length > 0 ? { hero: true as const } : {}),
    title: "Cómo cambia tu nota al releer",
    description:
      "Compara la nota del PRIMER pase con la del último, no con la del medio: la pregunta es qué te parece ahora frente a la primera vez.",
    context: {
      period: "Todo el histórico",
      scope: withAllTypes(itemFilter, "serie histórica"),
      filters: ["Solo obras releídas y valoradas dos veces"],
    },
    viz: "dumbbell",
    unit: UNITS.stars,
    labelHeader: "Obra",
    data: works.map((w) => ({
      key: `${w.type}:${w.itemId}`,
      label: w.title ?? "",
      from: w.first,
      value: w.latest,
      detail: `${w.passes} pases`,
    })),
    kpis: [
      {
        key: "media",
        label: "Cambio medio al releer",
        value: rereads.averageChange,
        unit: UNITS.stars,
        hint: "En estrellas, sobre las obras valoradas las dos veces",
      },
      {
        key: "obras",
        label: "Obras releídas",
        value: rereads.totalRereadWorks || null,
        unit: UNITS.works,
      },
      {
        key: "mejoran",
        label: "Te gustaron más",
        value: rereads.works.length > 0 ? subieron : null,
        unit: UNITS.works,
        hint: `De ${rereads.works.length} comparables`,
      },
    ],
    note:
      rereads.unratedRereads > 0
        ? `Hay ${rereads.unratedRereads} ${
            rereads.unratedRereads === 1 ? "relectura" : "relecturas"
          } fuera del gráfico por no tener nota en alguno de los dos pases. Sin decirlo, la media hablaría solo de las que sí valoraste dos veces.`
        : undefined,
    empty: {
      title: "Todavía no has releído nada",
      message:
        "Cierra un segundo pase de una obra que ya terminaste y aparecerá aquí con sus dos notas.",
    },
  };
}

// ── Parte-todo: tipo de obra ──────────────────────────────────────────────────
/**
 * Este panel ignora el filtro de tipo a propósito: es el que responde a esa
 * misma pregunta. Filtrarlo lo dejaría con un solo sector y el cien por cien,
 * que no informa de nada.
 */
function typePanel(input: StatsInput, period: string): PanelSpec {
  const { type, titles, itemFilter } = input;
  const ever = everFinishedTotal(input.byYear);
  return {
    id: "por-tipo",
    title: titles.type,
    context: {
      period,
      scope: withAllTypes(itemFilter),
      filters: ["Obras terminadas"],
    },
    viz: "waffle",
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
      elsewhere: wayOutToAllTime(
        input,
        ever,
        `En todo el histórico llevas ${ever} ${ever === 1 ? "obra terminada" : "obras terminadas"}`,
      ),
    },
  };
}

// ── Parte-todo: estados de la biblioteca ──────────────────────────────────────
function statusPanel({ status, titles }: StatsInput, filter: string | undefined): PanelSpec {
  return {
    id: "estados",
    dataWindow: "snapshot",
    title: titles.status,
    context: {
      period: "Ahora mismo",
      scope: "foto del momento",
      filter,
    },
    viz: "waffle",
    unit: UNITS.items,
    labelHeader: "Estado",
    series: STATUS_SERIES,
    data: status.buckets.map((b) => ({
      key: b.status,
      label: STATUS_LABEL[b.status],
      value: b.count,
    })),
    note: "No hay estado «pausada»: una obra parada sigue contando como «en curso».",
    empty: {
      title: "Tu biblioteca está vacía",
      message: "Añade una obra y verás aquí cómo se reparten sus estados.",
    },
  };
}

// ── Evolución temporal ────────────────────────────────────────────────────────
function hoursPanel({ hours, titles, todayISO, itemFilter }: StatsInput): PanelSpec {
  const currentYear = Number(todayISO.slice(0, 4));
  const currentMonth = Number(todayISO.slice(5, 7));
  return {
    id: "horas-por-mes",
    dataWindow: "long",
    title: titles.hours,
    context: {
      period: String(hours.year),
      scope: withAllTypes(itemFilter, "año natural"),
      filters: ["Sesiones de lectura"],
    },
    // Área, no barras: doce meses seguidos son una serie CONTINUA, y la curva
    // dice de un vistazo la forma del año que doce columnas sueltas obligan a
    // recomponer. De paso baja a cuatro los paneles de barras del muro, que era
    // media docena y sonaba a repetición.
    viz: "area",
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
    note: "Son los doce meses de un año natural, así que una semana o un mes elegidos arriba no lo recortan. Solo cuenta tiempo de sesiones con duración; un mes futuro sale como «Sin datos», no como cero.",
    empty: {
      title: "Sin sesiones registradas este año",
      message: "Registra una sesión con su duración para empezar a acumular.",
    },
  };
}

// ── Distribución por categorías ───────────────────────────────────────────────
/**
 * Géneros más frecuentes. La cifra que preside es el GÉNERO PRINCIPAL, no un
 * total, y esa es toda la corrección: **las barras de este panel no se suman**.
 *
 * Una obra con tres géneros en su ficha entra en las tres barras —es correcto,
 * cada barra contesta «¿cuántas obras distintas llevan este género?»—, pero el
 * resumen genérico de `bars` remataba con «Total N obras» sumándolas, y esa N
 * salía bastante mayor que las obras que de verdad se han terminado. Un total
 * inflado al lado de una cifra real es peor que no dar total: quien lo lea una
 * vez desconfía de las otras treinta tarjetas.
 */
function genresPanel(
  { catalog, titles }: StatsInput,
  period: string,
  filter: string | undefined,
): PanelSpec {
  const top = catalog.genres.slice(0, RANK_LIMIT);
  const main = catalog.genres[0] ?? null;
  const distinct = catalog.genres.length;
  return {
    id: "generos",
    title: titles.genres,
    description:
      "Cada barra son las obras DISTINTAS que llevan ese género en su ficha de catálogo. Una obra con varios géneros cuenta en todos ellos, así que las barras se leen una a una y no se suman entre sí.",
    context: {
      period,
      filter,
      filters:
        top.length < distinct ? [`${RANK_LIMIT} géneros más frecuentes`] : undefined,
    },
    viz: "bars",
    unit: UNITS.works,
    labelHeader: "Género",
    valueHeader: "Obras",
    series: [{ key: "count", label: "Obras", color: "var(--type-book)" }],
    data: top.map((g) => ({ key: g.name, label: g.name, value: g.count })),
    kpis: [
      {
        key: "principal",
        label: "Género principal",
        value: null,
        text: main?.name,
        hint: main
          ? `${main.count} ${main.count === 1 ? "obra suya" : "obras suyas"} en el periodo`
          : undefined,
      },
      {
        key: "distintos",
        label: "Géneros distintos",
        value: distinct,
        unit: UNITS.genres,
        hint: "Contando cada nombre una vez",
      },
    ],
    // Explícito, y no el resumen automático de `bars`: ese empieza por «Total»,
    // y aquí el total es justo la cifra que no existe.
    summary: main
      ? `Género principal: ${main.name}, en ${main.count} ${main.count === 1 ? "obra" : "obras"}. ${distinct} ${distinct === 1 ? "género distinto" : "géneros distintos"} en el periodo; las barras no se suman entre sí, porque una obra puede estar en varias.`
      : undefined,
    note:
      top.length < distinct
        ? `Se muestran ${RANK_LIMIT} de ${distinct} géneros. Las cuotas se calculan sobre los mostrados.`
        : undefined,
    empty: {
      title: "Sin géneros que mostrar",
      message: "Los géneros salen de la ficha de catálogo de lo que terminas.",
    },
  };
}

function authorsPanel({ catalog, titles, itemFilter, byYear }: StatsInput, period: string): PanelSpec {
  return {
    id: "autores",
    title: titles.authors,
    structurallyEmpty: everFinished(byYear, "book") ? undefined : NEVER_BOOKS,
    context: {
      period,
      filter: globalFilter(itemFilter),
      filters: ["Solo autores de libro", "Obras distintas"],
    },
    viz: "lollipop",
    unit: UNITS.works,
    labelHeader: "Autor",
    data: catalog.authors.slice(0, RANK_LIMIT).map((a) => ({
      key: a.name,
      label: a.name,
      value: a.works,
    })),
    kpis: [
      {
        key: "top",
        label: "Autor más leído",
        value: null,
        text: catalog.authors[0]?.name,
        hint: catalog.authors[0]
          ? `${catalog.authors[0].works} ${catalog.authors[0].works === 1 ? "obra" : "obras"}`
          : undefined,
      },
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

function decadesPanel({ catalog, titles, itemFilter }: StatsInput, period: string): PanelSpec {
  return {
    id: "decadas",
    title: titles.decades,
    context: {
      period,
      filter: globalFilter(itemFilter),
      filters: ["Década de publicación"],
    },
    viz: "bars",
    unit: UNITS.works,
    labelHeader: "Década",
    series: [{ key: "count", label: "Obras", color: "var(--accent)" }],
    data: catalog.decades.slice(0, 6).map((d) => ({
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
function habitsPanel(
  habits: Habits,
  title: string,
  period: string,
  filter: string | undefined,
): PanelSpec {
  const band = habits.favoriteBand
    ? `${pad(habits.favoriteBand.startHour)}:00–${pad((habits.favoriteBand.startHour + 2) % 24)}:00`
    : undefined;
  return {
    id: "habitos",
    title,
    context: { period, filter, filters: ["Sesiones de lectura"] },
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
      {
        key: "sesiones",
        label: "Sesiones",
        value: habits.sessions || null,
        unit: UNITS.sessions,
        hint: `En ${habits.activeDays} ${habits.activeDays === 1 ? "día" : "días"} distintos`,
      },
    ],
    note: "La franja solo cuenta sesiones con hora de inicio registrada; el día y la media, todas.",
    empty: {
      title: "Sin sesiones suficientes",
      message: "Registra alguna sesión para que se pueda deducir tu hábito.",
    },
  };
}

function recordsPanel(
  records: Records,
  streaks: Streaks,
  title: string,
  period: string,
  filter?: string,
): PanelSpec {
  const month = records.mostActiveMonth;
  return {
    id: "records",
    dataWindow: "long",
    title,
    context: { period, filter },
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

// ── Abandonos ─────────────────────────────────────────────────────────────────
/**
 * Etiqueta legible de cada motivo. La traducción vive AQUÍ y no en el getter
 * porque es presentación: el getter devuelve el valor del enum tal cual.
 */
const DROP_REASON_LABEL: Record<DropReason, string> = {
  no_enganchado: "No me enganchó",
  aburrido: "Me aburrió",
  no_es_momento: "No era el momento",
  no_esperado: "No era lo que esperaba",
  otro: "Otro motivo",
};

/**
 * Por qué abandonas.
 *
 * ⚠️ Este panel solo puede vivir en `/estadisticas`, que es privada y del dueño.
 * `passes.dropped_reason` es SIEMPRE privado, con independencia de `is_public`:
 * la tabla no concede `SELECT` sobre esa columna a nadie y la única vía de
 * lectura es la vista `pass_reviews`, enmascarada por dueño. Llevarlo a la
 * pestaña pública del perfil expondría el motivo por el que alguien dejó un
 * libro, que es exactamente lo que el esquema protege. Hay un test que lo afirma.
 */
function dropReasonsPanel(
  { drops, itemFilter }: StatsInput,
  period: string,
  filter: string | undefined,
): PanelSpec {
  const sinMotivo = drops.total - drops.withReason;
  return {
    id: "motivos-abandono",
    title: "Por qué abandonas",
    description:
      "Solo cuenta los abandonos que llevan motivo registrado. Un cero es una respuesta —«nunca lo dejo por eso»—, no un hueco.",
    context: {
      period,
      filter: filter ?? globalFilter(itemFilter),
      filters: ["Solo abandonos con motivo registrado"],
    },
    viz: "lollipop",
    unit: UNITS.passes,
    labelHeader: "Motivo",
    data: DROP_REASONS_ORDER.map((r) => ({
      key: r,
      label: DROP_REASON_LABEL[r],
      value: drops.byReason[r],
    })),
    kpis: [
      { key: "total", label: "Abandonos", value: drops.total || null, unit: UNITS.passes },
      {
        key: "con-motivo",
        label: "Con motivo registrado",
        value: drops.withReason || null,
        unit: UNITS.passes,
        hint: `De ${drops.total} ${drops.total === 1 ? "abandono" : "abandonos"}`,
      },
    ],
    note:
      sinMotivo > 0
        ? `${sinMotivo} ${sinMotivo === 1 ? "abandono no tiene" : "abandonos no tienen"} motivo: el campo nació el 14 de agosto de 2026 y no se rellenó hacia atrás. Sin decirlo, este reparto parecería hablar de todos.`
        : undefined,
    empty: {
      title: "No has abandonado nada en este periodo",
      message: "Aquí aparecerá el motivo que elijas al dejar una obra.",
    },
  };
}

/** Orden fijo, del motivo más frecuente al menos, para que no baile por datos. */
const DROP_REASONS_ORDER: DropReason[] = [
  "no_enganchado",
  "aburrido",
  "no_es_momento",
  "no_esperado",
  "otro",
];

/**
 * Dónde abandonas, y el punto pasado el cual ya no sueltas un libro.
 *
 * Solo libros: es lo único con una talla comparable en la ficha. El punto de no
 * retorno **no se afirma con pocos abandonos medidos** (ver `computeDropPoint`);
 * cuando falta, la barra se queda sin marca en vez de inventarse un límite.
 */
function dropPointPanel({ drops, itemFilter }: StatsInput, period: string): PanelSpec {
  const p = drops.point;
  const fuera = p.unmeasurable;
  return {
    id: "punto-abandono",
    title: "Dónde abandonas",
    description:
      "El porcentaje del libro que llevabas al dejarlo. La marca es tu abandono más tardío: pasado ese punto, nunca has soltado un libro.",
    context: {
      period,
      scope: withAllTypes(itemFilter, "solo libros"),
      filters: ["Libros con páginas en ficha"],
    },
    viz: "bullet",
    targetName: "tu abandono más tardío",
    unit: UNITS.percent,
    labelHeader: "Medida",
    data: [
      {
        key: "medio",
        label: "Avance medio al abandonar",
        value: p.averagePercent,
        target: p.pointOfNoReturn ?? undefined,
      },
    ],
    kpis: [
      {
        key: "medio",
        label: "Avance medio al abandonar",
        value: p.averagePercent,
        unit: UNITS.percent,
        hint: `Sobre ${p.measured} ${p.measured === 1 ? "abandono medible" : "abandonos medibles"}`,
      },
      {
        key: "limite",
        label: "Punto de no retorno",
        value: p.pointOfNoReturn,
        unit: UNITS.percent,
        hint:
          p.pointOfNoReturn === null
            ? "Hacen falta cinco abandonos medibles para afirmarlo"
            : "Pasado ese punto no has soltado ningún libro",
      },
    ],
    note:
      fuera > 0
        ? `${fuera} ${fuera === 1 ? "abandono queda" : "abandonos quedan"} fuera del cálculo: sin páginas en la ficha, con la posición guardada en otro formato, o con una página por encima del final (pasa cuando la edición leída no es la de la ficha).`
        : undefined,
    empty: {
      title: "No hay ningún abandono medible",
      message: "Hace falta que el libro traiga páginas en su ficha y que la posición esté guardada.",
    },
  };
}

// ── Acumulado / pila ──────────────────────────────────────────────────────────
function tbrPanel(tbr: TbrSnapshot, title: string, filter?: string): PanelSpec {
  return {
    id: "pila",
    dataWindow: "snapshot",
    title,
    context: {
      period: "Ahora mismo",
      scope: "foto del momento",
      filter,
    },
    viz: "waffle",
    unit: UNITS.items,
    labelHeader: "Tipo",
    series: TYPE_SERIES,
    data: [
      { key: "book", label: "Libros", value: tbr.byType.book },
      { key: "movie", label: "Películas", value: tbr.byType.movie },
      { key: "series", label: "Series", value: tbr.byType.series },
    ],
    kpis: [
      { key: "pendientes", label: "Pendientes", value: tbr.pending, unit: UNITS.items },
    ],
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
