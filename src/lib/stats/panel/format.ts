// Formato de los paneles. Todo en es-ES, como el resto de `src/lib/stats`
// (los meses de `records-card` y `month-calendar` ya iban en literal): el repo
// es mono-idioma y estas cadenas se COMPONEN con gramática, no se traducen.
//
// Regla dura: `null` nunca se imprime como «0». Un hueco se lee «Sin datos».

import type { PanelDelta, Unit } from "./types";

/** Texto de un valor ausente. Único sitio donde se decide. */
export const NO_DATA = "Sin datos";

const NBSP = " ";
/** Menos tipográfico (U+2212), no el guion del teclado. */
const MINUS = "−";

function nf(decimals: number): Intl.NumberFormat {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatNumber(value: number, decimals = 0): string {
  return nf(decimals).format(value);
}

export function plural(count: number, unit: Unit): string {
  return Math.abs(count) === 1 ? unit.one : unit.many;
}

/**
 * Valor + unidad corta, para celdas y ejes: «12 min», «34 %», «Sin datos».
 * El porcentaje lleva espacio duro antes del signo, como manda el español.
 */
export function formatValue(value: number | null, unit?: Unit): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  const n = formatNumber(value, unit?.decimals ?? 0);
  if (!unit) return n;
  // Cuando el símbolo corto ES la palabra en plural («obras», «días»), tiene que
  // concordar: si no, sale «1 obras» en el mínimo de cada histograma. Las
  // abreviaturas de verdad («min», «%», «★») no se tocan.
  const symbol = unit.short === unit.many ? plural(value, unit) : unit.short;
  return `${n}${unit.short === "%" ? NBSP : " "}${symbol}`;
}

/** Valor + unidad en prosa, con concordancia: «1 obra», «12 obras». */
export function formatProse(value: number | null, unit?: Unit): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  const n = formatNumber(value, unit?.decimals ?? 0);
  return unit ? `${n} ${plural(value, unit)}` : n;
}

/** Cuota sobre un total. `total <= 0` no es 0 %, es «sin datos». */
export function formatShare(value: number | null, total: number): string {
  if (value === null || total <= 0) return NO_DATA;
  return `${formatNumber(Math.round((value / total) * 100))}${NBSP}%`;
}

/**
 * Variación completa: valor, dirección, unidad y periodo de comparación.
 * «+12 obras más que en 2025» · «−3 obras menos que en 2025» · «Sin cambios
 * respecto a 2025». Nunca solo una flecha, nunca solo un color.
 */
export function formatDelta(delta: PanelDelta): string {
  const magnitude = formatProse(Math.abs(delta.value), delta.unit);
  if (delta.value === 0) return `Sin cambios respecto a ${delta.comparedTo}`;
  const sign = delta.value > 0 ? "+" : MINUS;
  const direction = delta.value > 0 ? "más" : "menos";
  return `${sign}${magnitude} ${direction} que ${connector(delta.comparedTo)}`;
}

/** Glifo de dirección. Acompaña al texto; jamás lo sustituye. */
export function deltaGlyph(delta: PanelDelta): string {
  if (delta.value === 0) return "=";
  return delta.value > 0 ? "▲" : "▼";
}

/**
 * ¿La variación es buena? `undefined` cuando el panel no opina — que es lo
 * normal: «más horas» no es mejor ni peor por sí solo.
 */
export function deltaIsGood(delta: PanelDelta): boolean | undefined {
  if (delta.higherIsBetter === undefined || delta.value === 0) return undefined;
  return delta.value > 0 === delta.higherIsBetter;
}

// «2025» pide «que en 2025»; «la semana pasada» pide «que la semana pasada».
function connector(comparedTo: string): string {
  return /^\d/.test(comparedTo) ? `en ${comparedTo}` : comparedTo;
}
