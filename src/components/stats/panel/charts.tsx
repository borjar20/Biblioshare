// Presentación: las visualizaciones. TODAS son decorativas — el armazón las
// envuelve en `aria-hidden`, porque el dato exacto vive en el resumen, en los
// indicadores y en la tabla. Por eso aquí no hay ni un `aria-label`: duplicar
// el valor en el gráfico solo consigue que el lector de pantalla lo lea dos
// veces y que las dos copias se desincronicen.
//
// Tres reglas de dibujo que no se negocian:
//   · un hueco (`null`) NO se dibuja — se marca con un punto tenue en la base;
//   · un cero medido SÍ se dibuja, como marca de 2 px sobre la base;
//   · el color nunca va solo: la leyenda lleva glifo de forma además de color.

import { GLYPH_CHAR, share, partValue, type PanelDerived } from "@/lib/stats/panel/derive";
import type { PanelDatum, PanelSpec } from "@/lib/stats/panel/types";

type ChartProps = { spec: PanelSpec; derived: PanelDerived };

/** Etiqueta del eje. Corta si la hay, y siempre bajo la marca. */
function AxisLabel({ datum }: { datum: PanelDatum }) {
  return (
    <span
      className={`truncate font-mono text-[8.5px] ${
        datum.value === null ? "text-foreground-faint" : "text-muted-foreground"
      }`}
    >
      {datum.short ?? datum.label}
    </span>
  );
}

/** Marca de «aquí no hay medida». Ni barra ni cero: un punto en la base. */
function GapMark() {
  return (
    <span className="mb-px block h-1 w-1 rounded-full bg-foreground-faint/60" />
  );
}

export function BarsChart({ spec, derived }: ChartProps) {
  const color = spec.series?.[0]?.color ?? "var(--accent)";
  return (
    <div className="flex h-24 items-end justify-between gap-0.5">
      {spec.data.map((d) => (
        <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end justify-center">
            {d.value === null ? (
              <GapMark />
            ) : d.value === 0 ? (
              // Cero medido: marca en la base, no una barra corta que mienta.
              <span className="block h-0.5 w-full max-w-3 rounded-full bg-surface-3" />
            ) : (
              <span
                className="block w-full max-w-3 rounded-t-[4px]"
                style={{
                  height: `max(4px, ${share(d.value, derived.scale)}%)`,
                  background: color,
                }}
              />
            )}
          </div>
          <AxisLabel datum={d} />
        </div>
      ))}
    </div>
  );
}

export function StackedChart({ spec, derived }: ChartProps) {
  return (
    <div className="flex h-24 items-end justify-between gap-1">
      {spec.data.map((d) => (
        <div key={d.key} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex w-full max-w-4 flex-1 flex-col-reverse justify-start gap-px">
            {d.value === null ? (
              <div className="flex justify-center">
                <GapMark />
              </div>
            ) : d.value === 0 ? (
              <span className="block h-0.5 w-full rounded-full bg-surface-3" />
            ) : (
              derived.series.map((s) => {
                const v = partValue(d, s.key);
                if (v === null || v <= 0) return null;
                return (
                  <span
                    key={s.key}
                    className="block w-full first:rounded-b-[2px] last:rounded-t-[4px]"
                    style={{
                      height: `max(3px, ${share(v, derived.scale)}%)`,
                      background: s.color,
                    }}
                  />
                );
              })
            )}
          </div>
          <AxisLabel datum={d} />
        </div>
      ))}
    </div>
  );
}

/**
 * Línea (o área). Los huecos PARTEN el trazo: unir por encima de un `null`
 * dibujaría una tendencia que nadie midió.
 */
export function LineChart({ spec, derived, area = false }: ChartProps & { area?: boolean }) {
  const W = 100;
  const H = 40;
  const n = spec.data.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / derived.scale) * (H - 4) - 2;
  const color = spec.series?.[0]?.color ?? "var(--accent)";

  // Tramos continuos de puntos medidos.
  const runs: { i: number; v: number }[][] = [];
  let run: { i: number; v: number }[] = [];
  spec.data.forEach((d, i) => {
    if (d.value === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push({ i, v: d.value });
    }
  });
  if (run.length) runs.push(run);

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible"
      >
        <line
          x1={0}
          y1={H - 2}
          x2={W}
          y2={H - 2}
          stroke="var(--border)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {runs.map((r, ri) => (
          <g key={ri}>
            {area && r.length > 1 && (
              <polygon
                points={`${x(r[0].i)},${H - 2} ${r
                  .map((p) => `${x(p.i)},${y(p.v)}`)
                  .join(" ")} ${x(r[r.length - 1].i)},${H - 2}`}
                fill={color}
                opacity={0.14}
              />
            )}
            <polyline
              points={r.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Un tramo de un solo punto no tiene línea: se marca con el punto. */}
            {r.length === 1 && (
              <circle cx={x(r[0].i)} cy={y(r[0].v)} r={2} fill={color} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        ))}
      </svg>
      <div className="flex justify-between gap-0.5">
        {spec.data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 text-center">
            <AxisLabel datum={d} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Anillo parte-todo. Solo hasta 6 sectores; más allá, la tabla es más legible. */
export function DonutChart({ spec, derived }: ChartProps) {
  const total = derived.total;
  const slices = derived.known.filter((d) => d.value > 0).slice(0, 6);
  // Sumas parciales sin mutar nada: como mucho son 6 sectores.
  const pcts = slices.map((d) => (d.value / total) * 100);
  const stops = pcts.map((p, i) => {
    const from = pcts.slice(0, i).reduce((a, b) => a + b, 0);
    return `${colorFor(spec, i)} ${from}% ${from + p}%`;
  });
  const used = pcts.reduce((a, b) => a + b, 0);
  if (used < 100) stops.push(`var(--surface-3) ${used}% 100%`);

  return (
    <div className="flex justify-center py-1">
      <div
        className="grid h-28 w-28 place-items-center rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      >
        <span className="grid h-20 w-20 place-items-center rounded-full bg-surface font-serif text-xl font-semibold text-foreground">
          {total}
        </span>
      </div>
    </div>
  );
}

/** Medidor de progreso hacia un objetivo. El valor exacto lo dan los KPIs. */
export function GaugeChart({ spec, derived }: ChartProps) {
  const target = spec.target ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((derived.total / target) * 100)) : 0;
  const reached = target > 0 && derived.total >= target;
  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: reached ? "var(--green)" : "var(--accent)",
          }}
        />
      </div>
      {/* La marca del objetivo, para que «dónde está la meta» no sea solo color. */}
      {target > 0 && (
        <div className="flex justify-between font-mono text-[9px] text-foreground-faint">
          <span>0</span>
          <span>meta {target}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Mapa de calor. Rampa de UN solo tono por opacidad (nunca arcoíris) y, sobre
 * ella, el número del día: la intensidad orienta, el dígito informa.
 */
export function HeatmapChart({ spec, derived }: ChartProps) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {spec.data.map((d) => {
        const v = d.value;
        const intensity = v === null || v <= 0 ? 0 : 0.25 + 0.75 * (v / derived.scale);
        return (
          <span
            key={d.key}
            className={`grid aspect-square place-items-center rounded-md font-mono text-[10px] ${
              v === null
                ? "border border-dashed border-border text-foreground-faint"
                : v === 0
                  ? "bg-surface-muted text-muted-foreground"
                  : "font-semibold text-foreground"
            }`}
            style={
              intensity > 0
                ? { background: `color-mix(in srgb, var(--accent) ${intensity * 100}%, var(--surface))` }
                : undefined
            }
          >
            {d.short ?? d.label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Leyenda. Presente siempre que haya 2+ series, y con GLIFO además de color —
 * la paleta de tipos del proyecto es indistinguible en deuteranopia
 * (ΔE 1,1 medido entre `--type-movie` y `--type-series`), así que el color por
 * sí solo no identifica nada. Va fuera de `aria-hidden`: nombra las series.
 */
export function Legend({ derived }: { derived: PanelDerived }) {
  if (derived.series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {derived.series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ color: s.color }} className="text-[9px] leading-none">
            {GLYPH_CHAR[s.glyph]}
          </span>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

// Color de un sector del anillo: el de su serie si la hay, si no la rotación
// fija del proyecto. Sigue a la entidad por posición, nunca al ranking.
const FALLBACK_COLORS = [
  "var(--type-book)",
  "var(--type-movie)",
  "var(--type-series)",
  "var(--gold)",
  "var(--green)",
  "var(--status-planned)",
];

function colorFor(spec: PanelSpec, index: number): string {
  return spec.series?.[index]?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/** Elige la visualización. `ranking`, `kpi` y `table` no dibujan: son texto. */
export function Chart({ spec, derived }: ChartProps) {
  switch (spec.viz) {
    case "bars":
      return <BarsChart spec={spec} derived={derived} />;
    case "stacked":
      return <StackedChart spec={spec} derived={derived} />;
    case "line":
      return <LineChart spec={spec} derived={derived} />;
    case "area":
      return <LineChart spec={spec} derived={derived} area />;
    case "donut":
      return <DonutChart spec={spec} derived={derived} />;
    case "gauge":
      return <GaugeChart spec={spec} derived={derived} />;
    case "heatmap":
      return <HeatmapChart spec={spec} derived={derived} />;
    default:
      return null;
  }
}
