// Modelo de datos de un panel estadístico. UNA fuente para las cinco capas:
// el resumen textual, los indicadores, el gráfico y la tabla se calculan todos
// desde el mismo `PanelSpec` — ningún componente visual inventa un valor, una
// etiqueta ni una conclusión.
//
// Separación deliberada (ver docs/design/paneles-estadisticos.md):
//   datos          → este fichero + los getters de `src/lib/stats/*`
//   transformación → `derive.ts`  (totales, máximos, cuotas, huecos)
//   interpretación → `summary.ts` (la frase; sin JSX)
//   presentación   → `src/components/stats/panel/*`
//   accesibilidad  → la estructura semántica de `stat-panel.tsx`

import type { ReactNode } from "react";

/** Unidad de la magnitud. Se usa igual en el eje, en la celda y en la prosa. */
export type Unit = {
  /** Símbolo corto para ejes y celdas de tabla: "min", "%", "obras". */
  short: string;
  /** Singular para prosa: "obra". */
  one: string;
  /** Plural para prosa: "obras". */
  many: string;
  /** Decimales al formatear. 0 por defecto. */
  decimals?: number;
};

// Unidades del proyecto. Añade aquí, no en el componente: así el resumen y la
// tabla concuerdan sin repetir cadenas.
export const UNITS = {
  works: { short: "obras", one: "obra", many: "obras" },
  items: { short: "títulos", one: "título", many: "títulos" },
  minutes: { short: "min", one: "minuto", many: "minutos" },
  pages: { short: "págs.", one: "página", many: "páginas" },
  days: { short: "días", one: "día", many: "días" },
  sessions: { short: "sesiones", one: "sesión", many: "sesiones" },
  authors: { short: "autores", one: "autor", many: "autores" },
  genres: { short: "géneros", one: "género", many: "géneros" },
  episodes: { short: "eps.", one: "episodio", many: "episodios" },
  seasons: { short: "temp.", one: "temporada", many: "temporadas" },
  passes: { short: "pases", one: "pase", many: "pases" },
  percent: { short: "%", one: "por ciento", many: "por ciento" },
  stars: { short: "★", one: "estrella", many: "estrellas", decimals: 1 },
} as const satisfies Record<string, Unit>;

/** Periodo, filtros y alcance: la pregunta «¿de qué me está hablando?». */
export type PanelContext = {
  /** Periodo ya resuelto a texto: "2026", "Todo el histórico", "Últimos 7 días". */
  period: string;
  /**
   * El filtro GLOBAL de la vista, ya resuelto a texto: "Solo libros".
   *
   * Va en el rótulo, con el periodo, y no con el resto de filtros. Es una
   * distinción de fondo, no de sitio: `filters` son las condiciones propias del
   * panel («solo pases con nota»), que no cambian nunca; este lo acaba de
   * elegir quien mira, y si no se ve junto a la cifra, la cifra miente por
   * omisión — «97 obras» sin más parece el total y es solo el de libros.
   */
  filter?: string;
  /** Filtros propios del panel, ya resueltos a texto: ["Solo pases con nota"]. */
  filters?: string[];
  /**
   * Alcance, cuando el panel NO obedece al selector de periodo de la página.
   * Sin esto, un panel que ignora el filtro miente por omisión.
   *
   * **Va en el rótulo, junto al periodo, así que tiene que ser CORTO** — dos o
   * tres palabras («foto del momento», «serie histórica»). La explicación larga
   * es cosa de `note`.
   */
  scope?: string;
};

/** Un tramo del desglose apilado de un punto. Su suma debe dar `PanelDatum.value`. */
export type PanelPart = {
  /** Coincide con `PanelSeries.key`. */
  key: string;
  value: number | null;
};

export type PanelDatum = {
  key: string;
  /** Etiqueta completa, la que lee el lector de pantalla: "Enero", "Fantasía". */
  label: string;
  /** Etiqueta corta solo para el eje del gráfico: "E", "25". Por defecto, `label`. */
  short?: string;
  /**
   * `null` = SIN DATO. `0` = cero real y medido.
   * Nunca uses 0 para "no lo sé": el gráfico dibuja el cero y omite el hueco.
   */
  value: number | null;
  /** Desglose por serie, para `stacked`. */
  parts?: PanelPart[];
  /** Texto libre para la columna «Detalle» de la tabla. */
  detail?: string;
  /** Si la fila lleva a algún sitio, el enlace va en la tabla (no en el gráfico). */
  href?: string;
};

/** Canal redundante al color. Obligatorio: la paleta de marca falla en CVD. */
export type SeriesGlyph = "circle" | "square" | "triangle" | "diamond";

export type PanelSeries = {
  key: string;
  label: string;
  /** Expresión CSS: "var(--type-book)". El color NUNCA es el único canal. */
  color: string;
  /** Por defecto se asigna por posición (ver GLYPH_ORDER en `derive.ts`). */
  glyph?: SeriesGlyph;
};

/** Variación: valor, dirección, periodo de comparación y unidad. Las cuatro. */
export type PanelDelta = {
  /** Magnitud con signo, en la unidad de `unit`. */
  value: number;
  unit: Unit;
  /** Contra qué se compara: "2025", "la semana pasada". */
  comparedTo: string;
  /**
   * Si subir es lo bueno. Solo matiza la prosa y el glifo; jamás se codifica
   * únicamente en color.
   */
  higherIsBetter?: boolean;
};

export type PanelKpi = {
  key: string;
  label: string;
  /** Valor numérico. `null` = sin datos (se lee «Sin datos», no «0»). */
  value: number | null;
  unit?: Unit;
  /** Alternativa para KPIs no numéricos: "Martes", "18:00–20:00". */
  text?: string;
  delta?: PanelDelta;
  /** Ayuda breve de cómo se calcula. */
  hint?: string;
};

/**
 * Columnas de la tabla, declarativas. Los paneles apilados añaden además una
 * columna por serie automáticamente.
 */
export type PanelColumnId = "label" | "value" | "share" | "detail";

export type PanelViz =
  | "bars"
  | "stacked"
  | "line"
  | "area"
  | "donut"
  | "gauge"
  | "heatmap"
  | "ranking"
  | "kpi"
  | "table";

/**
 * Estado del panel. Ojo: «vacío» NO está aquí — se deriva de los datos, para
 * que nadie pueda declarar «vacío» un panel que sí trae ceros medidos.
 */
export type PanelState =
  | { status: "ready" }
  | { status: "loading" }
  | { status: "error"; message?: string; retry?: ReactNode }
  /** Hay datos, pero incompletos. `message` dice qué falta y por qué. */
  | { status: "partial"; message: string };

export type PanelAction = {
  label: string;
  href: string;
};

export type PanelSpec = {
  /** Único en la página: prefija los `id` de título, resumen y tabla. */
  id: string;
  title: string;
  /**
   * Qué mide y cómo se calcula. Se pinta bajo el contexto, ANTES del dato:
   * cambia cómo se interpreta la cifra, así que llega tarde en una nota al pie.
   * Va como texto normal, no en `aria-describedby`: así se lee igual con lector
   * de pantalla que con la vista, y no queda escondido en una descripción.
   */
  description?: string;
  context: PanelContext;
  viz: PanelViz;
  /**
   * El panel que preside su sección: ocupa las TRES columnas del masonry.
   *
   * UNO por sección como mucho, y el primero de la lista (lo afirma
   * `specs.test.ts`). Dos héroes seguidos parten la sección en bandas y el
   * masonry deja de repartir — que es justo el motivo por el que la rejilla se
   * descartó en su día (ver el comentario largo de `page.tsx`).
   *
   * Se marca por NECESITAR EL ANCHO, no por importancia: 53 semanas de
   * calendario en un tercio de tarjeta son ilegibles, mientras que una cifra
   * grande no gana nada por ocupar tres veces más.
   */
  hero?: true;
  unit: Unit;
  data: PanelDatum[];
  /** Obligatorio para `stacked`; opcional en el resto para colorear. */
  series?: PanelSeries[];
  /** Objetivo de `gauge`. `null` = sin objetivo configurado. */
  target?: number | null;
  kpis?: PanelKpi[];
  /** Sustituye al resumen generado. Solo si ninguna regla da la frase. */
  summary?: string;
  /** Por defecto, las que toque según `viz` (ver `defaultColumns`). */
  columns?: PanelColumnId[];
  /** Cabecera de la primera columna: "Mes", "Género", "Año". */
  labelHeader?: string;
  /** Cabecera de la columna de valor. Por defecto, la unidad en plural. */
  valueHeader?: string;
  /**
   * Disposición del mapa de calor cuando NO es una rejilla de siete columnas.
   * Sin esto, un año entero se pinta como un mes larguísimo: 365 celdas en 7
   * columnas dan 53 filas y una tarjeta de cinco mil píxeles que arrastra a
   * toda la sección.
   *
   * Con `rows`, las celdas fluyen por COLUMNA: cada columna es una semana.
   * `offset` es la fila en la que empieza la primera celda (0 = primera fila),
   * y es lo que alinea los días de la semana — sin él, el 1 de enero cae
   * siempre arriba y las filas dejan de ser lunes, martes…
   */
  heatmap?: {
    rows: number;
    offset?: number;
    /** Cuántas columnas ocupa la rejilla; hace falta para alinear los meses. */
    columns?: number;
    /** Rótulos de mes sobre la rejilla, con la columna en la que empieza cada uno. */
    months?: { label: string; column: number }[];
  };
  /**
   * La ventana REAL del dato, cuando no es la que elige el selector de la
   * página. Sirve para **no enseñar un panel que no puede contestar la
   * pregunta**, en vez de enseñarlo con una nota que avisa de que habla de otra
   * cosa: con «Semana» puesto, doce meses de barras al lado de siete días no se
   * leen como un alcance distinto, se leen como una contradicción.
   *
   *  · `snapshot` — es una foto de AHORA (estados, la pila, rachas). Solo tiene
   *    sitio con el periodo en «todo», donde «ahora» es parte de «todo».
   *  · `long` — necesita meses o años (el año natural, la serie histórica, los
   *    récords). Desaparece con las ventanas cortas: semana y mes.
   *
   * Sin declarar = el panel obedece al selector y se enseña siempre.
   * Solo lo aplica el muro (`buildStatsSections`); la pestaña del perfil está
   * fijada al mes y elige sus paneles a mano.
   */
  dataWindow?: "snapshot" | "long";
  /** Interpretación o advertencia al pie. */
  note?: string;
  actions?: PanelAction[];
  state?: PanelState;
  /** Qué decir cuando no hay NINGÚN dato conocido. */
  empty?: { title: string; message?: string };
};
