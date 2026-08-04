// Transformación: del `PanelSpec` a las magnitudes que consumen el resumen, los
// indicadores, el gráfico y la tabla. Se calcula UNA vez por panel y se pasa a
// todos, para que ninguno pueda discrepar del otro.

import type {
  PanelColumnId,
  PanelDatum,
  PanelKpi,
  PanelSeries,
  PanelSpec,
  SeriesGlyph,
} from "./types";

/** Orden fijo de glifos. Sigue a la entidad por posición, nunca al ranking. */
export const GLYPH_ORDER: SeriesGlyph[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
];

/** Carácter del glifo. Solo decorativo: la tabla ya nombra la serie. */
export const GLYPH_CHAR: Record<SeriesGlyph, string> = {
  circle: "●",
  square: "■",
  triangle: "▲",
  diamond: "◆",
};

/** Un punto que sí trae medida. `value` deja de ser opcional. */
export type MeasuredDatum = PanelDatum & { value: number };

export type PanelDerived = {
  /** Puntos con valor medido (excluye los `null`). */
  known: MeasuredDatum[];
  /** Cuántos puntos vienen sin dato. */
  missing: number;
  /** Suma de los conocidos. `0` legítimo si todo lo medido es cero. */
  total: number;
  /** Mayor y menor de los conocidos, o `null` si no hay con qué comparar. */
  max: MeasuredDatum | null;
  min: MeasuredDatum | null;
  /** Escala del gráfico. Siempre > 0 para no dividir por cero. */
  scale: number;
  /** No hay ni un valor medido: el panel va a estado vacío. */
  isEmpty: boolean;
  /** Hay medidas y todas valen cero. Es un dato, no un vacío. */
  allZero: boolean;
  series: Required<PanelSeries>[];
};

export function derive(spec: PanelSpec): PanelDerived {
  const known = spec.data.filter((d): d is MeasuredDatum => d.value !== null);
  const total = known.reduce((sum, d) => sum + d.value, 0);

  let max: MeasuredDatum | null = null;
  let min: MeasuredDatum | null = null;
  for (const d of known) {
    if (max === null || d.value > max.value) max = d;
    if (min === null || d.value < min.value) min = d;
  }

  // Con un solo punto, o con todos iguales, «el máximo» no dice nada: el
  // resumen debe callarse en vez de señalar un ganador inventado.
  if (known.length < 2 || max?.value === min?.value) {
    max = null;
    min = null;
  }

  const peak = known.reduce((m, d) => Math.max(m, d.value), 0);

  return {
    known,
    missing: spec.data.length - known.length,
    total,
    max,
    min,
    scale: peak > 0 ? peak : 1,
    // Un panel de indicadores no tiene serie: está vacío cuando ninguno de sus
    // KPIs trae valor ni texto.
    isEmpty:
      spec.viz === "kpi"
        ? !(spec.kpis ?? []).some((k) => k.value !== null || Boolean(k.text))
        : known.length === 0,
    allZero: known.length > 0 && peak === 0,
    series: withGlyphs(spec.series ?? []),
  };
}

/** Asigna el glifo por posición cuando la spec no lo fija. */
export function withGlyphs(series: PanelSeries[]): Required<PanelSeries>[] {
  return series.map((s, i) => ({
    ...s,
    glyph: s.glyph ?? GLYPH_ORDER[i % GLYPH_ORDER.length],
  }));
}

/** Valor de un tramo apilado. `undefined` (serie ausente) es sin dato, no cero. */
export function partValue(datum: PanelDatum, seriesKey: string): number | null {
  const part = datum.parts?.find((p) => p.key === seriesKey);
  return part ? part.value : null;
}

/** Altura del tramo en % de la escala. Un `null` no ocupa; un `0`, tampoco. */
export function share(value: number | null, scale: number): number {
  if (value === null || scale <= 0) return 0;
  return (value / scale) * 100;
}

/**
 * El indicador que preside el panel plegado. Si la spec no trae KPIs, se
 * fabrica uno con el total (o el máximo, cuando sumar no significa nada).
 *
 * No es cosmético: la vista compacta esconde la tabla, así que sin esto un
 * panel plegado volvería a ser un dibujo sin ninguna cifra en el DOM — justo lo
 * que este sistema existe para impedir.
 */
export function heroKpi(spec: PanelSpec, derived: PanelDerived): PanelKpi | null {
  if (spec.kpis?.length) {
    // El primero QUE TENGA DATO. Si no, un panel de tres indicadores con el
    // primero vacío presidía con un «Sin datos» enorme teniendo los otros dos
    // llenos justo debajo.
    return spec.kpis.find((k) => k.value !== null || Boolean(k.text)) ?? spec.kpis[0];
  }
  if (derived.isEmpty) return null;

  // Una media o un ranking de notas no se suman: preside el mejor.
  if (spec.viz === "ranking" || spec.unit.short === "★") {
    return derived.known[0]
      ? { key: "top", label: derived.known[0].label, value: derived.known[0].value, unit: spec.unit }
      : null;
  }
  return { key: "total", label: "Total", value: derived.total, unit: spec.unit };
}

/** Columnas por defecto según la visualización. Se pueden fijar en la spec. */
export function defaultColumns(spec: PanelSpec): PanelColumnId[] {
  if (spec.columns) return spec.columns;
  const detail = spec.data.some((d) => d.detail) ? (["detail"] as const) : [];
  switch (spec.viz) {
    case "ranking":
      return ["label", "value", ...detail];
    case "donut":
    case "stacked":
      return ["label", "value", "share", ...detail];
    case "heatmap":
      return ["label", "value", ...detail];
    default:
      return ["label", "value", "share", ...detail];
  }
}
