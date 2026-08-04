// Presentación: las visualizaciones.
//
// HASTA AQUÍ eran TODAS decorativas: el armazón las envolvía en `aria-hidden`
// porque el dato exacto vivía en la tabla de la capa. Ya no es así en las tres
// que el handoff «Gráficos sin tabla mensual» reescribe —barras, anillo y mapa
// del año—: esas llevan sus cifras DENTRO, como texto, y por eso pierden la
// tabla que las repetía fila a fila. Un mapa de 365 filas no era una tabla
// legible ni para quien la ve ni para quien la escucha.
//
// La consecuencia manda sobre el resto del fichero: si el gráfico ES el dato,
// no puede depender del ratón. Cada tramo que muestra un desglose al pasar por
// encima es también FOCALIZABLE y lleva su desglose en el nombre accesible; el
// globo aparece con `:hover` y con `:focus-visible`, en CSS puro. Cero
// JavaScript: un tooltip que solo existe al pasar el cursor deja fuera a quien
// navega con teclado, y eso convertiría el dato en decoración otra vez.
//
// `PLAIN` lista las que siguen siendo decorativas (línea, área, medidor): su
// dato sigue en la tabla, así que el armazón las oculta al lector como antes.
//
// Tres reglas de dibujo que no se negocian:
//   · un hueco (`null`) NO se dibuja — se marca con un punto tenue en la base;
//   · un cero medido SÍ se dibuja, como marca de 2 px sobre la base;
//   · el color nunca va solo: la leyenda lleva glifo de forma además de color.

import { GLYPH_CHAR, share, partValue, type PanelDerived } from "@/lib/stats/panel/derive";
import { formatNumber, formatValue } from "@/lib/stats/panel/format";
import type { PanelDatum, PanelSpec } from "@/lib/stats/panel/types";

type ChartProps = {
  spec: PanelSpec;
  derived: PanelDerived;
  /**
   * Si el gráfico se puede consultar punto a punto (foco + globo).
   *
   * Solo en la CAPA. En la cara, el disparador del modal cubre la tarjeta
   * entera con `absolute inset-0`, así que un tramo focalizable ahí quedaría
   * tapado por él: el ratón nunca lo alcanzaría y el teclado enfocaría algo que
   * no se ve. Las cifras escritas sí salen en las dos — son texto, no control.
   */
  interactive?: boolean;
};

/**
 * Visualizaciones que siguen siendo DECORATIVAS: su dato exacto vive en la
 * tabla de la capa, así que el armazón las esconde al lector de pantalla. Las
 * que no están aquí llevan sus cifras dentro y se leen.
 */
export const PLAIN_VIZ: PanelSpec["viz"][] = ["line", "area", "gauge"];

// Alto del área de dibujo. Con todo a cero no hay altura que enseñar: reservar
// 96 px de hueco solo mete aire muerto entre la cifra y las etiquetas.
function plotHeight(derived: PanelDerived): string {
  return derived.allZero ? "h-8" : "h-24";
}

// Barras finas con muchos puntos; algo más anchas cuando hay pocos, o la
// tarjeta se queda con cinco rayitas perdidas en medio del ancho.
function barWidth(count: number): string {
  return count <= 7 ? "max-w-6" : "max-w-3";
}

/**
 * Etiqueta del eje. Corta si la hay, y siempre bajo la marca.
 *
 * `block w-full` no es decorado: sin ancho propio, la columna la centra en
 * ajuste al contenido y `truncate` no tiene qué recortar — «Fantasía» y
 * «Ciencia ficción» se pisaban una encima de otra.
 */
function AxisLabel({ datum }: { datum: PanelDatum }) {
  return (
    <span
      className={`block w-full truncate text-center font-mono text-[8.5px] ${
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

/** Clases del globo. Sale con el ratón y con el foco, sin una línea de JS. */
// `hidden`/`block`, NO `invisible`/`opacity-0`. Un elemento con
// `visibility: hidden` sigue ocupando su sitio en el desbordamiento del
// contenedor: cada globo mide ~120 px, va centrado sobre una columna de ~25 y
// se sale medio ancho por cada extremo del gráfico. Como la capa ampliada es un
// `<dialog>` con `overflow-y: auto` —y eso hace que `overflow-x` compute a
// `auto` también—, los globos ESCONDIDOS le metían una barra de scroll
// horizontal permanente. `display: none` no aporta nada al desbordamiento.
// A cambio se pierde la transición de opacidad, que no la echa nadie de menos.
const TIP =
  "pointer-events-none hidden absolute bottom-full left-1/2 z-20 mb-1.5 " +
  "-translate-x-1/2 whitespace-nowrap rounded-lg border border-border " +
  "bg-surface-3 px-2.5 py-1.5 text-left text-[11px] leading-relaxed " +
  "text-foreground shadow-card " +
  "group-hover:block group-focus-visible:block";

/**
 * Desglose por serie de un punto apilado, para el globo y para el nombre
 * accesible. Se compone UNA vez y se usa en los dos sitios: si se escribieran
 * por separado acabarían diciendo cosas distintas.
 */
function breakdown(spec: PanelSpec, derived: PanelDerived, d: PanelDatum) {
  return derived.series
    .map((s) => ({ label: s.label, color: s.color, value: partValue(d, s.key) }))
    .filter((p) => p.value !== null);
}

function pointLabel(spec: PanelSpec, derived: PanelDerived, d: PanelDatum): string {
  const parts = breakdown(spec, derived, d);
  const head = `${d.label}: ${formatValue(d.value, spec.unit)}`;
  if (parts.length === 0) return head;
  return `${head} — ${parts.map((p) => `${formatNumber(p.value ?? 0)} ${p.label.toLowerCase()}`).join(", ")}`;
}

/** El globo con el desglose exacto del punto. */
function PointTip({
  spec,
  derived,
  datum,
}: {
  spec: PanelSpec;
  derived: PanelDerived;
  datum: PanelDatum;
}) {
  const parts = breakdown(spec, derived, datum);
  return (
    <span aria-hidden className={TIP}>
      <span className="label-section block">{datum.label}</span>
      {parts.map((p) => (
        <span key={p.label} className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            <span style={{ color: p.color }}>■ </span>
            {p.label}
          </span>
          <span className="font-mono tabular-nums">{formatNumber(p.value ?? 0)}</span>
        </span>
      ))}
      <span
        className={`flex justify-between gap-4 ${
          parts.length > 0 ? "mt-1 border-t border-border pt-1" : ""
        }`}
      >
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono tabular-nums">{formatValue(datum.value, spec.unit)}</span>
      </span>
    </span>
  );
}

/**
 * Columna de barra: la marca, el total ENCIMA y el globo con el desglose.
 *
 * El total siempre visible es lo que sustituye a la fila de la tabla. Y el
 * `tabIndex` no es un adorno: es lo que hace que el desglose exista sin ratón.
 */
function BarColumn({
  spec,
  derived,
  datum,
  interactive,
  children,
}: {
  spec: PanelSpec;
  derived: PanelDerived;
  datum: PanelDatum;
  interactive?: boolean;
  children: React.ReactNode;
}) {
  const probe = interactive && datum.value !== null;
  return (
    <div
      className="group relative flex h-full min-w-0 flex-1 flex-col items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      tabIndex={probe ? 0 : undefined}
      role={probe ? "img" : undefined}
      aria-label={probe ? pointLabel(spec, derived, datum) : undefined}
    >
      <span
        aria-hidden
        className={`h-3 font-mono text-[9.5px] leading-3 ${
          datum.value === null ? "text-transparent" : "text-muted-foreground"
        }`}
      >
        {datum.value === null ? "" : formatNumber(datum.value)}
      </span>
      {children}
      <AxisLabel datum={datum} />
      {probe && <PointTip spec={spec} derived={derived} datum={datum} />}
    </div>
  );
}

export function BarsChart({ spec, derived, interactive }: ChartProps) {
  const color = spec.series?.[0]?.color ?? "var(--accent)";
  return (
    <div className={`flex ${plotHeight(derived)} items-end justify-between gap-0.5 pt-4`}>
      {spec.data.map((d) => (
        <BarColumn key={d.key} spec={spec} derived={derived} datum={d} interactive={interactive}>
          <div className="flex w-full flex-1 items-end justify-center">
            {d.value === null ? (
              <GapMark />
            ) : d.value === 0 ? (
              // Cero medido: marca en la base, no una barra corta que mienta.
              <span className={`block h-0.5 w-full ${barWidth(spec.data.length)} rounded-full bg-surface-3`} />
            ) : (
              <span
                className={`block w-full ${barWidth(spec.data.length)} rounded-t-[4px]`}
                style={{
                  height: `max(4px, ${share(d.value, derived.scale)}%)`,
                  background: color,
                }}
              />
            )}
          </div>
        </BarColumn>
      ))}
    </div>
  );
}

export function StackedChart({ spec, derived, interactive }: ChartProps) {
  return (
    <div className={`flex ${plotHeight(derived)} items-end justify-between gap-1 pt-4`}>
      {spec.data.map((d) => (
        <BarColumn key={d.key} spec={spec} derived={derived} datum={d} interactive={interactive}>
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
        </BarColumn>
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

/**
 * Anillo parte-todo. Solo hasta 6 sectores; más allá, la tabla es más legible.
 *
 * SIN cifra en el centro: la suma ya preside la tarjeta como indicador, y
 * repetirla dentro del anillo gastaba el único sitio donde cabe lo que de
 * verdad falta — cuánto vale CADA sector. Ese número va ahora fuera de su arco
 * y en su color, así que el reparto se lee sin acercarse y sin tabla.
 *
 * Se dibuja en SVG y no con `conic-gradient` justamente por eso: un gradiente
 * es un fondo, no tiene tramos a los que apuntar, así que ni podía llevar
 * separación entre sectores ni un `<title>` por arco.
 */
export function DonutChart({ spec, derived }: ChartProps) {
  const total = derived.total;
  // Con todo a cero SÍ se dibuja el anillo, vacío: es un cero medido, no una
  // ausencia de datos, y la tarjeta perdería su forma si desapareciera. Los
  // sectores son los que no se pintan, porque no hay ninguno que pintar.
  const slices = total > 0 ? derived.known.filter((d) => d.value > 0).slice(0, 6) : [];

  const SIZE = 132;
  const THICK = 20;
  const r = (SIZE - THICK) / 2;
  const c = SIZE / 2;
  const circ = 2 * Math.PI * r;

  // Sumas parciales sin mutar nada: como mucho son 6 sectores, y acumular
  // dentro del `map` es justo lo que prohíbe la regla de inmutabilidad de React.
  const lengths = slices.map((d) => (d.value / total) * circ);
  const arcs = slices.map((d, i) => {
    const start = lengths.slice(0, i).reduce((a, b) => a + b, 0);
    return { datum: d, len: lengths[i], start, mid: (start + lengths[i] / 2) / circ };
  });

  return (
    <div className="flex justify-center py-1">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={THICK} />
          {arcs.map(({ datum, len, start }) => (
            <circle
              key={datum.key}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={colorFor(spec, datum)}
              strokeWidth={THICK}
              // 2 px de aire entre sectores: sin él, dos colores contiguos que
              // fallan en daltonismo se leen como un solo tramo.
              strokeDasharray={`${Math.max(0, len - 2)} ${circ - Math.max(0, len - 2)}`}
              strokeDashoffset={-start}
            />
          ))}
        </svg>
        {arcs.map(({ datum, mid }) => {
          const angle = mid * 2 * Math.PI;
          const R = r + THICK / 2 + 12;
          return (
            <span
              key={datum.key}
              aria-hidden
              className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[12px] font-semibold"
              style={{
                left: c + R * Math.sin(angle),
                top: c - R * Math.cos(angle),
                color: colorFor(spec, datum),
              }}
            >
              {formatNumber(datum.value)}
            </span>
          );
        })}
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

/** Cuántos días destacados llevan su cifra escrita encima de la celda. */
const HEATMAP_TOP = 3;

/**
 * Separación mínima, en columnas, entre dos cifras escritas sobre el mosaico.
 *
 * En una tarjeta de 340 px las celdas miden unos 6 px y una cifra ocupa como
 * tres columnas: los tres días más movidos de una misma racha —que es el caso
 * NORMAL, porque los picos vienen juntos— se pisaban entre ellos y con los
 * rótulos de mes. Se prefieren menos etiquetas y legibles a tres ilegibles.
 */
const HEATMAP_LABEL_GAP = 4;

/**
 * Los días que llevan su cifra escrita: los más movidos, descartando los que
 * caerían encima de uno ya escrito.
 */
function loudDays(
  data: PanelDatum[],
  offset: number,
): Set<string> {
  const columnOf = (i: number) => Math.floor((i + offset) / 7);
  const ranked = data
    .map((d, i) => ({ key: d.key, value: d.value ?? 0, column: columnOf(i) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const taken: number[] = [];
  const out = new Set<string>();
  for (const d of ranked) {
    if (out.size >= HEATMAP_TOP) break;
    if (taken.some((c) => Math.abs(c - d.column) < HEATMAP_LABEL_GAP)) continue;
    taken.push(d.column);
    out.add(d.key);
  }
  return out;
}

/**
 * Mapa de calor. Rampa de UN solo tono por opacidad (nunca arcoíris).
 *
 * DOS DENSIDADES, y la elige el DATO, no una opción de estilo:
 *
 *  · Un mes (31 celdas) va en siete columnas CON el número del día dentro: la
 *    intensidad orienta y el dígito informa.
 *  · Un año (365) fluye por columna —cada columna, una semana— con las
 *    ETIQUETAS DE MES encima y la cifra escrita solo sobre los días más
 *    movidos. Trescientas sesenta y cinco cifras diminutas no se leen; tres sí,
 *    y son las que contestan «¿cuándo fue tu mejor día?» sin pasar el ratón.
 *    El resto se consulta apuntando a la celda.
 */
export function HeatmapChart({ spec, derived, interactive }: ChartProps) {
  const layout = spec.heatmap;

  if (layout) {
    const loud = loudDays(spec.data, layout.offset ?? 0);

    return (
      // `gap-4` entre los rótulos de mes y la rejilla: la cifra de un día que
      // cae en lunes se dibuja SOBRE su celda, y en la primera fila eso la
      // pondría encima del rótulo del mes.
      <div className="flex flex-col gap-4 pt-3">
        {layout.months && layout.months.length > 0 && (
          <div
            aria-hidden
            className="grid gap-px font-mono text-[8px] text-foreground-faint"
            style={{ gridTemplateColumns: `repeat(${layout.columns ?? 53}, minmax(0, 1fr))` }}
          >
            {layout.months.map((m) => (
              <span key={m.label} style={{ gridColumnStart: m.column + 1 }}>
                {m.label}
              </span>
            ))}
          </div>
        )}
        <div
          className="grid grid-flow-col gap-px"
          style={{
            gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
            gridAutoColumns: "minmax(0, 1fr)",
          }}
        >
          {spec.data.map((d, i) => {
            const v = d.value;
            const intensity = v === null || v <= 0 ? 0 : 0.25 + 0.75 * (v / derived.scale);
            const probe = Boolean(interactive) && v !== null && v > 0;
            return (
              <span
                key={d.key}
                tabIndex={probe ? 0 : undefined}
                role={probe ? "img" : undefined}
                aria-label={probe ? `${d.label}: ${formatValue(v, spec.unit)}` : undefined}
                className={`group relative aspect-square rounded-[1.5px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                  v === null
                    ? "border border-dashed border-border"
                    : v === 0
                      ? "bg-surface-muted"
                      : ""
                } ${loud.has(d.key) ? "ring-1 ring-accent" : ""}`}
                style={{
                  // Solo la PRIMERA celda se desplaza: a partir de ahí el flujo
                  // por columna coloca sola cada una en su día de la semana.
                  gridRowStart: i === 0 && layout.offset ? layout.offset + 1 : undefined,
                  background:
                    intensity > 0
                      ? `color-mix(in srgb, var(--accent) ${intensity * 100}%, var(--surface))`
                      : undefined,
                }}
              >
                {loud.has(d.key) && (
                  <span
                    aria-hidden
                    className="absolute bottom-full left-1/2 z-10 mb-0.5 -translate-x-1/2 rounded bg-foreground px-1 font-mono text-[8px] leading-[1.4] font-semibold text-surface"
                  >
                    {formatNumber(v ?? 0)}
                  </span>
                )}
                {probe && (
                  <span aria-hidden className={TIP}>
                    <span className="label-section block">{d.label}</span>
                    <span className="font-mono tabular-nums">
                      {formatValue(v, spec.unit)}
                    </span>
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

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
 *
 * En el anillo lleva además el VALOR y la cuota de cada categoría. Es lo que
 * permitió retirar su tabla: sin esto, quitar la tabla habría dejado el reparto
 * exacto solo al alcance del ratón.
 */
export function Legend({
  derived,
  spec,
}: {
  derived: PanelDerived;
  spec?: PanelSpec;
}) {
  if (derived.series.length < 2) return null;
  const withValues = spec?.viz === "donut";
  const byKey = new Map(derived.known.map((d) => [d.key, d.value]));

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {derived.series.map((s) => {
        const value = withValues ? byKey.get(s.key) : undefined;
        const pct =
          value !== undefined && derived.total > 0
            ? Math.round((value / derived.total) * 100)
            : null;
        return (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden style={{ color: s.color }} className="text-[9px] leading-none">
              {GLYPH_CHAR[s.glyph]}
            </span>
            {s.label}
            {value !== undefined && (
              <span className="font-mono tabular-nums text-foreground">
                {formatNumber(value)}
                {pct !== null && (
                  <span className="text-muted-foreground"> ({pct}%)</span>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Rotación de reserva cuando la spec no declara series.
const FALLBACK_COLORS = [
  "var(--type-book)",
  "var(--type-movie)",
  "var(--type-series)",
  "var(--gold)",
  "var(--green)",
  "var(--status-planned)",
];

/**
 * Color de un sector: **el de SU categoría**, buscada por clave.
 *
 * Antes se buscaba por la posición del sector, y eso repintaba el anillo entero
 * en cuanto una categoría valía cero: al desaparecer «Pendiente», «En curso»
 * heredaba su color y quien hubiera aprendido el reparto leía otro. El color
 * sigue a la entidad, nunca al ranking.
 */
function colorFor(spec: PanelSpec, datum: PanelDatum): string {
  const own = spec.series?.find((s) => s.key === datum.key);
  if (own) return own.color;
  // Sin series, el índice ESTABLE es el del conjunto completo, no el del sector.
  const i = spec.data.findIndex((d) => d.key === datum.key);
  return FALLBACK_COLORS[(i < 0 ? 0 : i) % FALLBACK_COLORS.length];
}

/** Elige la visualización. `ranking`, `kpi` y `table` no dibujan: son texto. */
export function Chart({ spec, derived, interactive }: ChartProps) {
  switch (spec.viz) {
    case "bars":
      return <BarsChart spec={spec} derived={derived} interactive={interactive} />;
    case "stacked":
      return <StackedChart spec={spec} derived={derived} interactive={interactive} />;
    case "line":
      return <LineChart spec={spec} derived={derived} />;
    case "area":
      return <LineChart spec={spec} derived={derived} area />;
    case "donut":
      return <DonutChart spec={spec} derived={derived} />;
    case "gauge":
      return <GaugeChart spec={spec} derived={derived} />;
    case "heatmap":
      return <HeatmapChart spec={spec} derived={derived} interactive={interactive} />;
    default:
      return null;
  }
}
