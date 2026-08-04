// Interpretación: del dato a la frase. Pura y sin JSX, para poder probarla.
//
// El resumen responde, en este orden, a «¿cuál es el dato principal?», «¿qué
// destaca?» y «¿cómo se reparte?». Cada regla se CALLA cuando el dato no la
// sostiene: con un solo punto no hay máximo, sin total no hay cuota, y un hueco
// nunca se cuenta como cero. Esa es toda la lógica de «adaptarse a los datos
// disponibles».

import { derive, partValue, type PanelDerived } from "./derive";
import { formatDelta, formatProse, formatShare, formatValue } from "./format";
import type { PanelSpec } from "./types";

/** Limpia las frases que ninguna regla llenó y las puntúa. */
function sentences(raw: (string | null)[]): string[] {
  return raw
    .filter((s): s is string => Boolean(s))
    .map((s) => (s.endsWith(".") ? s : `${s}.`));
}


/** «3 de 12 periodos sin datos» — el hueco se nombra, no se rellena con cero. */
function missingSentence(d: PanelDerived, total: number): string | null {
  if (d.missing === 0) return null;
  return d.missing === 1
    ? "1 punto sin datos"
    : `${d.missing} de ${total} puntos sin datos`;
}

function extremesSentence(d: PanelDerived, spec: PanelSpec): string | null {
  if (!d.max || !d.min) return null;
  const hi = `Máximo: ${d.max.label} (${formatValue(d.max.value, spec.unit)})`;
  const lo = `mínimo: ${d.min.label} (${formatValue(d.min.value, spec.unit)})`;
  return `${hi}; ${lo}`;
}

/** Reparto de las series de un apilado, de mayor a menor, hasta tres. */
function mixSentence(spec: PanelSpec, d: PanelDerived): string | null {
  if (d.series.length === 0 || d.total <= 0) return null;
  const totals = d.series
    .map((s) => ({
      label: s.label,
      value: d.known.reduce((sum, datum) => sum + (partValue(datum, s.key) ?? 0), 0),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  if (totals.length === 0) return null;
  const parts = totals
    .slice(0, 3)
    .map((s) => `${s.label} ${formatValue(s.value, spec.unit)} (${formatShare(s.value, d.total)})`);
  return `Reparto: ${parts.join(", ")}`;
}

/** La variación del primer indicador que la traiga. */
function deltaSentence(spec: PanelSpec): string | null {
  const withDelta = spec.kpis?.find((k) => k.delta);
  return withDelta?.delta ? formatDelta(withDelta.delta) : null;
}

/**
 * Frases del resumen, sueltas y en orden de importancia: dato principal →
 * extremos → reparto → variación → huecos. Devuelve [] si no hay ni una medida
 * (ahí toca estado vacío, no una frase de relleno).
 *
 * Se exponen sueltas porque la vista compacta enseña SOLO la primera y la
 * ampliada las enseña todas — partir el párrafo por el punto sería adivinar.
 */
export function summaryLines(spec: PanelSpec, derived = derive(spec)): string[] {
  if (spec.summary) return [spec.summary];
  if (derived.isEmpty) return [];

  const d = derived;
  const n = d.known.length;
  const unit = spec.unit;

  // Todo medido y todo a cero: es una respuesta, y muy distinta de «sin datos».
  // Van DOS frases a propósito: la segunda es la que ve la vista compacta, y es
  // justo la que separa «medí y salió cero» de «no llegué a medir».
  if (d.allZero && spec.viz !== "gauge") {
    return sentences([
      "Sin actividad",
      `Los ${n} ${n === 1 ? "punto medido vale" : "puntos medidos valen"} cero; no es que falten datos`,
      missingSentence(d, spec.data.length),
    ]);
  }

  switch (spec.viz) {
    case "kpi": {
      const main = spec.kpis?.[0];
      if (!main) return [];
      const value = main.text ?? formatProse(main.value, main.unit ?? unit);
      return sentences([`${main.label}: ${value}`, deltaSentence(spec)]);
    }

    case "gauge": {
      const done = d.total;
      const target = spec.target ?? null;
      if (target === null || target <= 0) {
        return sentences([
          `${formatProse(done, unit)} acumuladas. Sin objetivo configurado`,
          deltaSentence(spec),
        ]);
      }
      const pct = formatShare(done, target);
      const rest = target - done;
      return sentences([
        rest <= 0
          ? `Objetivo cumplido: ${formatProse(done, unit)} de ${formatProse(target, unit)} (${pct})`
          : `${formatProse(done, unit)} de ${formatProse(target, unit)} (${pct}); faltan ${formatProse(rest, unit)}`,
        deltaSentence(spec),
      ]);
    }

    case "ranking": {
      const first = d.known[0];
      const last = d.known[n - 1];
      return sentences([
        `${n} ${n === 1 ? "posición" : "posiciones"}`,
        first ? `1.ª ${first.label} (${formatValue(first.value, unit)})` : null,
        // Mayúscula: cada elemento de `sentences` es una FRASE y se une con
        // punto. En minúscula salía «1.ª Dune (5,0 ★). última Solaris (4,0 ★).».
        n > 1 ? `Última ${last.label} (${formatValue(last.value, unit)})` : null,
        missingSentence(d, spec.data.length),
      ]);
    }

    case "heatmap": {
      const active = d.known.filter((x) => x.value > 0).length;
      return sentences([
        `${active} de ${n} ${n === 1 ? "día" : "días"} con actividad (${formatShare(active, n)})`,
        d.max ? `Máximo: ${d.max.label} (${formatValue(d.max.value, unit)})` : null,
        missingSentence(d, spec.data.length),
      ]);
    }

    case "donut": {
      // Sin participio: «repartidas» concuerda con obras pero no con títulos, y
      // la unidad la elige cada panel.
      return sentences([
        `Total ${formatProse(d.total, unit)} en ${n} ${n === 1 ? "categoría" : "categorías"}`,
        d.max
          ? `Mayor: ${d.max.label}, ${formatValue(d.max.value, unit)} (${formatShare(d.max.value, d.total)})`
          : null,
        missingSentence(d, spec.data.length),
      ]);
    }

    case "stacked": {
      return sentences([
        `Total ${formatProse(d.total, unit)} en ${n} ${n === 1 ? "periodo" : "periodos"}`,
        extremesSentence(d, spec),
        mixSentence(spec, d),
        deltaSentence(spec),
        missingSentence(d, spec.data.length),
      ]);
    }

    // bars, line, area y table comparten la lectura: cuánto en total, qué
    // destaca y cuánto falta.
    default: {
      return sentences([
        `Total ${formatProse(d.total, unit)} en ${n} ${n === 1 ? "punto" : "puntos"}`,
        extremesSentence(d, spec),
        deltaSentence(spec),
        missingSentence(d, spec.data.length),
      ]);
    }
  }
}

/** Resumen completo, en un párrafo. Vista ampliada. */
export function buildSummary(spec: PanelSpec, derived = derive(spec)): string {
  return summaryLines(spec, derived).join(" ");
}

/**
 * La frase que acompaña a la cifra en la vista compacta: lo que DESTACA, no el
 * total — que ya preside la tarjeta como cifra grande. Por eso es la SEGUNDA
 * línea, no la primera: repetir «Total 78 obras» debajo de un «78 obras» de
 * 32 px es gastar la única línea de prosa que tiene la vista general.
 *
 * Si no hay nada que destacar (un dato único, todos iguales), no hay frase.
 */
export function buildHighlight(spec: PanelSpec, derived = derive(spec)): string {
  return summaryLines(spec, derived)[1] ?? "";
}
