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
  passes: { short: "pases", one: "pase", many: "pases" },
  percent: { short: "%", one: "por ciento", many: "por ciento" },
  stars: { short: "★", one: "estrella", many: "estrellas", decimals: 1 },
} as const satisfies Record<string, Unit>;

/** Periodo, filtros y alcance: la pregunta «¿de qué me está hablando?». */
export type PanelContext = {
  /** Periodo ya resuelto a texto: "2026", "Todo el histórico", "Últimos 7 días". */
  period: string;
  /** Filtros activos, ya resueltos a texto: ["Solo libros"]. */
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
  /** Interpretación o advertencia al pie. */
  note?: string;
  actions?: PanelAction[];
  state?: PanelState;
  /** Qué decir cuando no hay NINGÚN dato conocido. */
  empty?: { title: string; message?: string };
};
