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
// `PLAIN` lista las que siguen siendo decorativas (hoy solo el medidor): su
// dato sigue en la tabla, así que el armazón las oculta al lector como antes.
//
// Cuatro reglas de dibujo que no se negocian:
//   · un hueco (`null`) NO se dibuja — se marca con un contorno DISCONTINUO,
//     el mismo lenguaje del mosaico; nunca con algo que se parezca al cero;
//   · un cero medido SÍ se dibuja, como marca de 2 px sobre la base;
//   · ni el hueco ni el cero escriben su cifra encima: treinta «0» seguidos
//     tapan el eje y no dicen nada que la raya no diga ya;
//   · el color nunca va solo: la leyenda lleva glifo de forma además de color.

import { GLYPH_CHAR, share, partValue, type PanelDerived } from "@/lib/stats/panel/derive";
import { formatNumber, formatValue, NO_DATA } from "@/lib/stats/panel/format";
import { UNITS, type PanelDatum, type PanelSpec } from "@/lib/stats/panel/types";

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
 *
 * La línea salió de aquí: ahora escribe el valor de cada punto bajo su marca y
 * cada punto es focalizable, como las barras. Su tabla de doce filas repetía
 * exactamente eso y nada más — doce meses y un número, ya visibles arriba.
 * El medidor se queda: es UNA cifra contra un objetivo, y esa cifra ya preside
 * la tarjeta como indicador.
 */
export const PLAIN_VIZ: PanelSpec["viz"][] = ["gauge"];

// Alto del área de dibujo. Con todo a cero no hay altura que enseñar: reservar
// 96 px de hueco solo mete aire muerto entre la cifra y las etiquetas.
//
// Pero tampoco vale `h-8`: en esos 32 px caben la fila de cifras, las marcas y
// los rótulos del eje solo si nada mide nada, y en cuanto el mes en curso trae
// sus días futuros —marca discontinua de 10 px— el eje se quedaba con altura
// CERO y sus números no se veían. 56 px es lo que ocupan las tres filas.
function plotHeight(derived: PanelDerived): string {
  return derived.allZero ? "h-14" : "h-24";
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
 *
 * El alto es FIJO (`h-3 leading-3`) y se pinta también cuando no hay rótulo:
 * una columna con la etiqueta vacía y otra con ella mediría distinto, y con la
 * marca repartiéndose el alto sobrante las barras dejarían de compartir base.
 */
function AxisLabel({
  datum,
  muted = false,
  roomy = false,
}: {
  datum: PanelDatum;
  muted?: boolean;
  /**
   * El rótulo puede DESBORDAR su columna. Solo en el eje podado: ahí sus dos
   * vecinos están vacíos, así que un «10» centrado se lee entero. Con todas las
   * columnas rotuladas hay que recortar, o «Fantasía» se monta sobre «Ciencia
   * ficción»; pero recortando, una columna de un mes (~9 px) dejaba «10» en
   * «1» y el eje numeraba mal.
   */
  roomy?: boolean;
}) {
  return (
    <span
      // Ancla de prueba: es la única forma de comprobar CUÁNTOS puntos llevan
      // rótulo sin atarse a la posición del `<span>` dentro de la columna.
      data-axis-label
      className={`block h-3 w-full shrink-0 text-center font-mono text-[8.5px] leading-3 ${
        roomy ? "overflow-visible whitespace-nowrap" : "truncate"
      } ${datum.value === null ? "text-foreground-faint" : "text-muted-foreground"}`}
    >
      {muted ? "" : (datum.short ?? datum.label)}
    </span>
  );
}

/**
 * A partir de cuántos puntos el eje deja de rotularlos todos.
 *
 * Un mes son 31 columnas de ~9 px: treinta y un números seguidos no son un eje,
 * son una textura. Doce meses o diez notas sí se leen enteros, así que el corte
 * va por encima de eso.
 */
const AXIS_DENSE_FROM = 14;

/**
 * Qué puntos llevan rótulo. `null` = todos.
 *
 * Uno de cada cinco (que es lo que deja leer un mes: 5, 10, 15…) **más el
 * pico**, porque es el punto que más se busca y el que caería sin nombre justo
 * cuando importa. Si el máximo empata o hay un solo punto, `derived.max` es
 * `null` y no se añade ninguno — no se inventa un ganador.
 */
function axisLabelKeys(spec: PanelSpec, derived: PanelDerived): Set<string> | null {
  if (spec.data.length <= AXIS_DENSE_FROM) return null;
  const keys = new Set<string>();
  spec.data.forEach((d, i) => {
    if ((i + 1) % 5 === 0) keys.add(d.key);
  });
  if (derived.max) keys.add(derived.max.key);
  return keys;
}

/**
 * Marca de «aquí no hay medida»: un contorno DISCONTINUO, el mismo lenguaje que
 * ya usa el mosaico para sus días sin dato. Antes era un punto tenue en la base,
 * indistinguible a simple vista de la raya del cero medido — y son dos cosas
 * opuestas: una es «no leí» y la otra «no lo sé».
 */
function GapMark({ width = "max-w-4" }: { width?: string }) {
  return (
    <span
      className={`block h-2.5 w-full ${width} rounded-t-[4px] border border-dashed border-border`}
    />
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
  axisKeys = null,
  children,
}: {
  spec: PanelSpec;
  derived: PanelDerived;
  datum: PanelDatum;
  interactive?: boolean;
  /**
   * Qué puntos llevan rótulo cuando el eje va podado (ver `axisLabelKeys`).
   * `null` = eje normal, todos rotulados.
   */
  axisKeys?: Set<string> | null;
  children: React.ReactNode;
}) {
  const probe = interactive && datum.value !== null;
  const showLabel = axisKeys === null || axisKeys.has(datum.key);
  // Ni el hueco ni el cero escriben su cifra arriba. El hueco porque no la
  // tiene; el cero porque en un mes flojo son treinta «0» seguidos sobre la
  // base, una ristra que tapa el eje y no dice nada que la raya del cero no
  // diga ya. El dato exacto sigue en el globo y en el nombre accesible.
  const quiet = datum.value === null || datum.value === 0;
  return (
    <div
      className="group relative flex h-full min-w-0 flex-1 flex-col items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      tabIndex={probe ? 0 : undefined}
      role={probe ? "img" : undefined}
      aria-label={probe ? pointLabel(spec, derived, datum) : undefined}
    >
      <span
        aria-hidden
        data-value-label
        className={`h-3 shrink-0 font-mono text-[9.5px] leading-3 ${
          quiet ? "text-transparent" : "text-muted-foreground"
        }`}
      >
        {datum.value === null || datum.value === 0 ? "" : formatNumber(datum.value)}
      </span>
      {children}
      <AxisLabel datum={datum} muted={!showLabel} roomy={axisKeys !== null} />
      {probe && <PointTip spec={spec} derived={derived} datum={datum} />}
    </div>
  );
}

export function BarsChart({ spec, derived, interactive }: ChartProps) {
  const color = spec.series?.[0]?.color ?? "var(--accent)";
  const labelled = axisLabelKeys(spec, derived);
  return (
    <div className={`flex ${plotHeight(derived)} items-end justify-between gap-0.5 pt-4`}>
      {spec.data.map((d) => (
        <BarColumn
          key={d.key}
          spec={spec}
          derived={derived}
          datum={d}
          interactive={interactive}
          axisKeys={labelled}
        >
          <div className="flex w-full flex-1 items-end justify-center">
            {d.value === null ? (
              <GapMark width={barWidth(spec.data.length)} />
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
  const labelled = axisLabelKeys(spec, derived);
  return (
    <div className={`flex ${plotHeight(derived)} items-end justify-between gap-1 pt-4`}>
      {spec.data.map((d) => (
        <BarColumn
          key={d.key}
          spec={spec}
          derived={derived}
          datum={d}
          interactive={interactive}
          axisKeys={labelled}
        >
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
 *
 * Lleva SU CIFRA EN CADA PUNTO, escrita debajo, y cada punto es focalizable con
 * su globo — igual que las barras. Es lo que le quitó la tabla: doce filas
 * («Enero 2026 · 34») que no añadían un dato que el gráfico no dijera ya, y que
 * en la capa se llevaban más alto que el propio gráfico.
 */
export function LineChart({
  spec,
  derived,
  interactive,
  area = false,
}: ChartProps & { area?: boolean }) {
  const W = 100;
  const H = 40;
  const n = spec.data.length;
  // El CENTRO de la columna, no el borde. Debajo hay una fila de `n` columnas
  // iguales con la cifra y el rótulo de cada punto; con el trazo anclado a los
  // extremos (`i/(n-1)`), el primer punto caía media columna a la izquierda de
  // su propio número y el último media a la derecha del suyo.
  const x = (i: number) => ((i + 0.5) / n) * W;
  const y = (v: number) => H - (v / derived.scale) * (H - 4) - 2;
  const labelled = axisLabelKeys(spec, derived);
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
      {/* El trazo es DECORATIVO y lo dice: un `<svg>` sin más se anuncia como
          una imagen sin nombre, y desde que el gráfico dejó de estar oculto al
          lector eso metía un elemento mudo entre los doce puntos que sí se
          nombran. El dato vive en las columnas de abajo. */}
      <svg
        aria-hidden
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
            {/* SIN punto por medida: con la cifra de cada mes escrita debajo,
                los doce círculos solo engordaban el trazo. Se queda el del
                tramo de UN solo punto, que no tiene línea que dibujar y sin
                él desaparecería del gráfico. */}
            {r.length === 1 && (
              <circle
                cx={x(r[0].i)}
                cy={y(r[0].v)}
                r={2}
                fill={color}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        ))}
      </svg>
      {/* Misma columna que las barras: cifra encima, rótulo debajo y globo con
          el detalle. Sin marca que dibujar en medio — la marca es el punto del
          trazo, que ya está justo encima. */}
      <div className="flex justify-between gap-0.5">
        {spec.data.map((d) => (
          <BarColumn
            key={d.key}
            spec={spec}
            derived={derived}
            datum={d}
            interactive={interactive}
            axisKeys={labelled}
          >
            {null}
          </BarColumn>
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
 *    ETIQUETAS DE MES encima y, YA AMPLIADO, la cifra escrita solo sobre los
 *    días más movidos. Trescientas sesenta y cinco cifras diminutas no se leen;
 *    tres sí, y son las que contestan «¿cuándo fue tu mejor día?» sin pasar el
 *    ratón. El resto se consulta apuntando a la celda.
 */
export function HeatmapChart({ spec, derived, interactive }: ChartProps) {
  const layout = spec.heatmap;

  if (layout) {
    // Las cifras sobre los días destacados son de la CAPA (`interactive`), no
    // de la tarjeta cerrada. En la cara el mosaico de un año mide unos 6 px por
    // celda: tres números en globo sobre esa rejilla tapan semanas enteras y no
    // se puede saber a qué día apuntan, así que quitan más de lo que dan. Al
    // ampliar, la rejilla es el doble de ancha y ahí sí señalan el día.
    const loud = interactive
      ? loudDays(spec.data, layout.offset ?? 0)
      : new Set<string>();

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
/**
 * Valor contra su propia referencia: barra de progreso con la marca de lo que
 * hay que batir.
 *
 * A diferencia de las barras o el lollipop, aquí cada fila NO se compara con las
 * otras: se compara consigo misma. Por eso UNA fila ya es un bullet completo, y
 * por eso `MIN_POINTS` no debe pedirle dos.
 *
 * La escala sí es común a todas las filas, y eso sí es necesario: si cada una se
 * escalara sola, dos barras del mismo largo dirían cifras distintas y comparar
 * entre filas —lo único que el ojo hace sin pedir permiso— sería falso.
 *
 * «Batida» se dice con PALABRA en el nombre accesible, no solo con el verde: el
 * color no diferencia nada por sí solo (principio 2).
 */
export function BulletChart({ spec, derived, interactive }: ChartProps) {
  const ceiling = Math.max(derived.scale, ...spec.data.map((d) => d.target ?? 0));
  return (
    <ul className="flex flex-col gap-2.5">
      {spec.data.map((d) => {
        const probe = interactive && d.value !== null;
        const beaten = d.target !== undefined && d.value !== null && d.value >= d.target;
        const label =
          d.value === null
            ? undefined
            : d.target === undefined
              ? `${d.label}: ${formatValue(d.value, spec.unit)}`
              : `${d.label}: ${formatValue(d.value, spec.unit)}, tu marca ${formatValue(
                  d.target,
                  spec.unit,
                )}${beaten ? " — marca batida" : ""}`;
        return (
          <li
            key={d.key}
            className="flex flex-col gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            tabIndex={probe ? 0 : undefined}
            role={probe ? "img" : undefined}
            aria-label={probe ? label : undefined}
          >
            <span aria-hidden className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-foreground-soft">{d.label}</span>
              <span className="font-mono text-[10.5px] tabular-nums text-foreground">
                {d.value === null ? NO_DATA : formatNumber(d.value)}
                {d.value !== null && d.target !== undefined && ` / ${formatNumber(d.target)}`}
              </span>
            </span>
            <span aria-hidden className="relative h-3 w-full rounded-full bg-surface-muted">
              {d.value !== null && (
                <span
                  data-fill
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${share(d.value, ceiling)}%`,
                    background: beaten ? "var(--green)" : "var(--gold-graphic)",
                  }}
                />
              )}
              {d.target !== undefined && (
                <span
                  data-target
                  className="absolute -inset-y-1 w-[2.5px] rounded-full bg-foreground"
                  style={{ left: `${share(d.target, ceiling)}%` }}
                />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Variación de dos puntos: de dónde a dónde.
 *
 * Es la forma de «cómo cambia tu nota al releer», y la razón de que no sean dos
 * barras ni una flecha es que aquí lo que importa es **la distancia**, no la
 * magnitud: entre 3,5 y 5 hay lo mismo que entre 2 y 3,5, y con barras desde
 * cero esas dos parejas se ven completamente distintas.
 *
 * La escala es COMÚN a todas las filas, como en el bullet: si cada una se
 * escalara sola, dos segmentos del mismo largo dirían saltos distintos.
 *
 * **La dirección no se codifica solo en color** (principio 2): la palabra
 * «sube», «baja» o «no cambia» va en el nombre accesible, y el punto de origen
 * es HUECO y el de destino MACIZO — forma, no tono.
 *
 * Una fila sin `from` no se dibuja: un punto de llegada suelto no es una
 * variación, es otro panel.
 */
export function DumbbellChart({ spec, derived, interactive }: ChartProps) {
  const rows = spec.data.filter(
    (d): d is PanelDatum & { from: number; value: number } =>
      d.from !== undefined && d.value !== null,
  );
  // El suelo NO es cero cuando lo que se compara son notas: todas caen entre 3 y
  // 5, y sobre un eje desde el origen los dos puntos de cada fila se pegan y el
  // salto —lo único que este panel enseña— deja de verse. Mismo criterio que el
  // lollipop, y por el mismo motivo.
  const values = rows.flatMap((d) => [d.from, d.value]);
  const zeroBased = spec.unit !== UNITS.stars;
  const floor = zeroBased || values.length === 0 ? 0 : Math.min(...values) * 0.94;
  const ceiling = Math.max(derived.scale, ...values, floor + 0.001);
  const span = Math.max(ceiling - floor, 0.001);
  const at = (v: number) => ((v - floor) / span) * 100;

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((d) => {
        const delta = d.value - d.from;
        // La palabra, no el signo: un «+1,5» pintado de verde deja fuera a quien
        // no distingue el verde, y un lector de pantalla dice «más uno coma
        // cinco», que no es lo mismo que «sube».
        const move =
          delta === 0
            ? "no cambia"
            : `${delta > 0 ? "sube" : "baja"} ${formatValue(Math.abs(delta), spec.unit)}`;
        const label = `${d.label}: de ${formatValue(d.from, spec.unit)} a ${formatValue(
          d.value,
          spec.unit,
        )}, ${move}`;
        const lo = Math.min(d.from, d.value);
        const hi = Math.max(d.from, d.value);
        return (
          <li
            key={d.key}
            className="flex flex-col gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "img" : undefined}
            aria-label={interactive ? label : undefined}
          >
            <span aria-hidden className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground-soft">
                {d.label}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-foreground">
                {formatNumber(d.from, spec.unit.decimals ?? 0)} →{" "}
                {formatValue(d.value, spec.unit)}
              </span>
            </span>
            <span aria-hidden className="relative h-3 w-full">
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              <span
                data-span
                className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                style={{
                  left: `${at(lo)}%`,
                  width: `${at(hi) - at(lo)}%`,
                  background: delta >= 0 ? "var(--green)" : "var(--status-dropped)",
                }}
              />
              {/* Origen HUECO, destino MACIZO. Es lo que dice cuál es cuál sin
                  depender de que se distinga un color de otro. */}
              <span
                data-from
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground-soft bg-surface"
                style={{ left: `${at(d.from)}%` }}
              />
              <span
                data-to
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${at(d.value)}%`,
                  background: delta >= 0 ? "var(--green)" : "var(--status-dropped)",
                }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Celdas del waffle cuando el total no cabe a una celda por obra. */
const WAFFLE_CELLS = 100;

/**
 * Reparto en rejilla de celdas contables.
 *
 * Sustituye al anillo por una razón del propio doc, no de gusto: el principio 3
 * de `paneles-estadisticos.md` prohíbe que un dato exija medir una altura, un
 * ÁREA o un ÁNGULO — y un sector de donut es exactamente eso. El anillo era el
 * único gráfico del muro que peleaba con nuestra propia regla, y había tres.
 *
 * Dos modos, y la diferencia se dice en voz alta debajo de la rejilla porque
 * cambia lo que el dibujo significa:
 *   ≤100 puntos → una celda = una obra. Lo que se cuenta ES el dato, sin redondeo.
 *   >100        → una celda = 1 %. Hay redondeo, y callarlo sería mentir.
 *
 * El reparto va por RESTO MAYOR. Redondear la cuota de cada serie por separado
 * da 99 o 101 celdas según caiga, y una rejilla de 10×10 con una celda de menos
 * se ve coja en la última fila.
 */
export function WaffleChart({ spec, derived }: ChartProps) {
  const total = derived.total;
  const perWork = total > 0 && total <= WAFFLE_CELLS;
  const cellCount = perWork ? total : WAFFLE_CELLS;

  // `known` ya excluye los huecos: un `null` no ocupa celdas, porque no se midió.
  const wanted = derived.known.map((d) => ({
    datum: d,
    want: total > 0 ? (d.value / total) * cellCount : 0,
  }));
  const shares = wanted.map((w) => ({ ...w, n: Math.floor(w.want) }));
  let left = cellCount - shares.reduce((sum, s) => sum + s.n, 0);
  for (const s of [...shares].sort((x, y) => (y.want % 1) - (x.want % 1))) {
    if (left <= 0) break;
    s.n += 1;
    left -= 1;
  }

  const cells = shares.flatMap((s) =>
    Array.from({ length: s.n }, (_, i) => ({
      key: `${s.datum.key}-${i}`,
      color: colorFor(spec, s.datum),
    })),
  );

  return (
    <div className="flex flex-col gap-2 py-1">
      {/* La rejilla se esconde al lector: cien celdas sueltas son cien nodos que
          no dicen nada. El dato exacto lo da la LEYENDA, que lleva serie, glifo
          y cifra, y que el armazón pinta también en la cara. Ahí está la mitad
          del invariante de `SELF_DESCRIBING` que este gráfico cumple. */}
      {/* TOPE DE ANCHO, y no es estético: la rejilla es cuadrada, así que sin él
          crece con la columna y una tarjeta de 340 px de ancho se lleva 340 de
          alto — dos veces y media lo que medía el anillo al que sustituye. Con
          220 px las celdas quedan en ~19, que es donde siguen siendo contables
          de un vistazo sin comerse la sección. */}
      <div aria-hidden data-cells className="grid max-w-[220px] grid-cols-10 gap-[3px]">
        {cells.map((c) => (
          <span
            key={c.key}
            data-cell
            className="aspect-square rounded-[3px]"
            style={{ background: c.color }}
          />
        ))}
      </div>
      <p className="font-mono text-[9px] text-foreground-faint">
        {perWork
          ? `cada celda = 1 ${spec.unit.one}`
          : `cada celda = 1 % · ${formatValue(total, spec.unit)} en total`}
      </p>
    </div>
  );
}

/**
 * Ranking dibujado: etiqueta · tallo · punto · valor exacto.
 *
 * Sustituye a `ranking`, que era una lista de texto. Siete paneles del muro lo
 * eran, tres de ellos seguidos en la misma sección: la repetición que se veía no
 * estaba en los gráficos, estaba en que más de la mitad del muro era tipografía.
 *
 * Lollipop y no barra maciza por dos motivos concretos: siete rankings más los
 * paneles de barras dejaban la pantalla llena de bloques, y los nombres de autor
 * y editorial son largos — el tallo fino deja sitio a la etiqueta que una barra
 * se come.
 *
 * LA ESCALA NO SIEMPRE ARRANCA EN CERO, y es deliberado. Con notas, todas las
 * medias caen entre 3 y 5: sobre un eje que empiece en cero, los puntos se
 * amontonan en el extremo derecho y el ranking deja de verse — que es lo único
 * que este panel tiene que enseñar. Con obras o minutos sí arranca en cero,
 * porque ahí el cero significa algo y recortarlo exageraría diferencias.
 */
export function LollipopChart({ spec, derived, interactive }: ChartProps) {
  // El suelo se recorta un pelo por debajo del mínimo (6 %) para que el punto
  // más bajo tenga tallo visible en vez de quedarse pegado al origen.
  const zeroBased = spec.unit !== UNITS.stars;
  const floor =
    zeroBased || derived.known.length === 0
      ? 0
      : Math.min(...derived.known.map((d) => d.value)) * 0.94;
  const span = Math.max(derived.scale - floor, 0.001);

  return (
    <ul className="flex flex-col gap-1.5">
      {spec.data.map((d) => {
        const probe = interactive && d.value !== null;
        const pct = d.value === null ? 0 : ((d.value - floor) / span) * 100;
        return (
          <li
            key={d.key}
            className="group relative grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            tabIndex={probe ? 0 : undefined}
            role={probe ? "img" : undefined}
            aria-label={probe ? `${d.label}: ${formatValue(d.value, spec.unit)}` : undefined}
          >
            <span className="truncate text-[11.5px] text-foreground-soft" title={d.label}>
              {d.label}
            </span>
            {d.value === null ? (
              // Hueco: ni tallo ni punto. Un tallo de longitud cero se leería
              // como «el peor de la lista», y `null` es «no se midió».
              <span className="text-[10px] text-foreground-faint">Sin datos</span>
            ) : (
              <span aria-hidden className="relative flex h-3 items-center">
                <span
                  data-stem
                  className="block h-0.5 rounded-full bg-surface-3"
                  style={{ width: `max(6px, ${pct}%)` }}
                />
                <span
                  className="-ml-1.5 block size-2.5 shrink-0 rounded-full"
                  style={{ background: colorFor(spec, d) }}
                />
              </span>
            )}
            <span
              aria-hidden
              className={`font-mono text-[10.5px] tabular-nums ${
                d.value === null ? "text-foreground-faint" : "text-foreground"
              }`}
            >
              {d.value === null ? "" : formatValue(d.value, spec.unit)}
            </span>
            {probe && d.detail && (
              <span aria-hidden className={TIP}>
                <span className="label-section block">{d.label}</span>
                <span className="text-muted-foreground">{d.detail}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Legend({
  derived,
  spec,
}: {
  derived: PanelDerived;
  spec?: PanelSpec;
}) {
  if (derived.series.length < 2) return null;
  // Los repartos parte-todo llevan la CIFRA en la leyenda. En el waffle no es
  // un adorno: su rejilla va `aria-hidden` (cien celdas sueltas no dicen nada) y
  // pierde la tabla por estar en `SELF_DESCRIBING`, así que la leyenda es el
  // único sitio donde queda el dato exacto.
  const withValues = spec?.viz === "donut" || spec?.viz === "waffle";
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

/**
 * Elige la visualización. `ranking`, `kpi` y `table` no dibujan: son texto.
 *
 * Despacha por `derived.viz`, la forma EFECTIVA, no por la que declara la spec:
 * si `derive()` decidió que dos puntos no dan una curva, aquí no puede seguir
 * dibujándose una línea de dos puntos.
 */
export function Chart({ spec, derived, interactive }: ChartProps) {
  switch (derived.viz) {
    case "bars":
      return <BarsChart spec={spec} derived={derived} interactive={interactive} />;
    case "stacked":
      return <StackedChart spec={spec} derived={derived} interactive={interactive} />;
    case "line":
      return <LineChart spec={spec} derived={derived} interactive={interactive} />;
    case "area":
      return <LineChart spec={spec} derived={derived} interactive={interactive} area />;
    case "donut":
      return <DonutChart spec={spec} derived={derived} />;
    case "gauge":
      return <GaugeChart spec={spec} derived={derived} />;
    case "heatmap":
      return <HeatmapChart spec={spec} derived={derived} interactive={interactive} />;
    case "lollipop":
      return <LollipopChart spec={spec} derived={derived} interactive={interactive} />;
    case "waffle":
      return <WaffleChart spec={spec} derived={derived} />;
    case "bullet":
      return <BulletChart spec={spec} derived={derived} interactive={interactive} />;
    case "dumbbell":
      return <DumbbellChart spec={spec} derived={derived} interactive={interactive} />;
    default:
      return null;
  }
}
