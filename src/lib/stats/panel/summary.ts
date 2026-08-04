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

/** Une frases en un párrafo, descartando las que ninguna regla llenó. */
function paragraph(sentences: (string | null)[]): string {
  return sentences
    .filter((s): s is string => Boolean(s))
    .map((s) => (s.endsWith(".") ? s : `${s}.`))
    .join(" ");
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
 * Resumen del panel. Devuelve `""` si no hay ni un dato medido — en ese caso el
 * panel debe pintar su estado vacío, no una frase de relleno.
 */
export function buildSummary(spec: PanelSpec, derived = derive(spec)): string {
  if (spec.summary) return spec.summary;
  if (derived.isEmpty) return "";

  const d = derived;
  const n = d.known.length;
  const unit = spec.unit;

  // Todo medido y todo a cero: es una respuesta, y muy distinta de «sin datos».
  if (d.allZero && spec.viz !== "gauge") {
    return paragraph([
      `Sin actividad: los ${n} puntos medidos valen cero`,
      missingSentence(d, spec.data.length),
    ]);
  }

  switch (spec.viz) {
    case "kpi": {
      const main = spec.kpis?.[0];
      if (!main) return "";
      const value = main.text ?? formatProse(main.value, main.unit ?? unit);
      return paragraph([`${main.label}: ${value}`, deltaSentence(spec)]);
    }

    case "gauge": {
      const done = d.total;
      const target = spec.target ?? null;
      if (target === null || target <= 0) {
        return paragraph([
          `${formatProse(done, unit)} acumuladas. Sin objetivo configurado`,
          deltaSentence(spec),
        ]);
      }
      const pct = formatShare(done, target);
      const rest = target - done;
      return paragraph([
        rest <= 0
          ? `Objetivo cumplido: ${formatProse(done, unit)} de ${formatProse(target, unit)} (${pct})`
          : `${formatProse(done, unit)} de ${formatProse(target, unit)} (${pct}); faltan ${formatProse(rest, unit)}`,
        deltaSentence(spec),
      ]);
    }

    case "ranking": {
      const first = d.known[0];
      const last = d.known[n - 1];
      return paragraph([
        `${n} ${n === 1 ? "posición" : "posiciones"}`,
        first ? `1.ª ${first.label} (${formatValue(first.value, unit)})` : null,
        n > 1 ? `última ${last.label} (${formatValue(last.value, unit)})` : null,
        missingSentence(d, spec.data.length),
      ]);
    }

    case "heatmap": {
      const active = d.known.filter((x) => x.value > 0).length;
      return paragraph([
        `${active} de ${n} ${n === 1 ? "día" : "días"} con actividad (${formatShare(active, n)})`,
        d.max ? `Máximo: ${d.max.label} (${formatValue(d.max.value, unit)})` : null,
        missingSentence(d, spec.data.length),
      ]);
    }

    case "donut": {
      return paragraph([
        `Total ${formatProse(d.total, unit)} repartidas en ${n} ${n === 1 ? "categoría" : "categorías"}`,
        d.max
          ? `Mayor: ${d.max.label}, ${formatValue(d.max.value, unit)} (${formatShare(d.max.value, d.total)})`
          : null,
        missingSentence(d, spec.data.length),
      ]);
    }

    case "stacked": {
      return paragraph([
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
      return paragraph([
        `Total ${formatProse(d.total, unit)} en ${n} ${n === 1 ? "punto" : "puntos"}`,
        extremesSentence(d, spec),
        deltaSentence(spec),
        missingSentence(d, spec.data.length),
      ]);
    }
  }
}
