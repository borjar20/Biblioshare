// El armazón único de TODOS los paneles estadísticos. Un panel no es un
// componente a medida: es este armazón + un `PanelSpec`.
//
// DOS DENSIDADES:
//
//   CARA (vista general) — lo que se ve de un vistazo, sin prosa:
//     rótulo de contexto · título · cifra grande · titular de una línea · gráfico
//   CAPA — el detalle, al pulsar en cualquier punto de la tarjeta:
//     todo lo anterior + descripción · resumen completo · resto de indicadores ·
//     tabla con los valores exactos · contexto largo · nota · acciones
//
// El detalle se abre en un modal (`PanelDialog`) y NO desplegando la tarjeta en
// línea. La razón es de maquetación, no de estilo: en una rejilla, un
// `<details>` que crece empuja a sus vecinas y mueve bajo el cursor justo lo
// que se estaba mirando. La capa deja el muro quieto.
//
// Lo que NO cambia en la cara: el dato sigue siendo texto. La cifra que preside
// la tarjeta es un `<dl>` de verdad (la fabrica `heroKpi` si la spec no trae
// indicadores) y debajo va lo que destaca. Una tarjeta cerrada nunca es solo un
// dibujo. La leyenda también viaja a la cara: un anillo sin leyenda sería
// identidad por color y nada más.
//
// La capa REPITE la cabecera, la cifra y el gráfico en vez de solo añadir lo que
// falta. Es a propósito: la capa tapa la tarjeta, así que sin repetirlos el
// detalle aparecería huérfano de la cifra que lo contextualiza. No duplica nada
// en el árbol accesible — un `<dialog>` cerrado no existe para el lector, y con
// la capa abierta el fondo queda `inert`.

import Link from "next/link";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { derive, heroKpi } from "@/lib/stats/panel/derive";
import {
  deltaGlyph,
  deltaIsGood,
  formatDelta,
  formatNumber,
  formatValue,
  NO_DATA,
} from "@/lib/stats/panel/format";
import { buildHighlight, summaryLines } from "@/lib/stats/panel/summary";
import type { PanelKpi, PanelSpec } from "@/lib/stats/panel/types";
import { Chart, Legend, PLAIN_VIZ } from "./charts";
import { PanelDialog } from "./panel-dialog";
import { contextSentence, PanelTable } from "./panel-table";

/** Visualizaciones que YA son texto: no dibujan ni repiten tabla. */
const TEXTUAL: PanelSpec["viz"][] = ["ranking", "kpi", "table"];

/**
 * Visualizaciones que llevan sus CIFRAS DENTRO, en texto: el total sobre cada
 * barra, el valor junto a cada sector, la cifra sobre los días más movidos.
 *
 * Son las que pierden la tabla de valores exactos, y las dos mitades de esa
 * frase van juntas a propósito. La tabla existía porque el dibujo era
 * decorativo; en cuanto el dibujo dice el número —y deja consultarlo con
 * teclado, no solo con el ratón—, la tabla pasa de ser la única vía a ser una
 * segunda copia de lo mismo. Y una segunda copia no es gratis: en el calendario
 * anual eran 365 filas que nadie lee y que enterraban el resto de la capa.
 *
 * Ojo al invariante: **quitar un `viz` de aquí obliga a devolverle la tabla**, y
 * añadir uno obliga a que su gráfico escriba sus valores y sea focalizable.
 */
const SELF_DESCRIBING: PanelSpec["viz"][] = [
  "bars",
  "stacked",
  "donut",
  "heatmap",
  "line",
  "area",
];

/** Cuántas filas de un ranking caben en la vista compacta. */
const RANKING_PREVIEW = 3;

const CARD =
  "rounded-card border border-border bg-surface shadow-card transition-colors";

export function StatPanel({
  spec,
  headingLevel = 2,
}: {
  spec: PanelSpec;
  /** 2 dentro de `<main>`; 3 si el panel cuelga de una sección con título. */
  headingLevel?: 2 | 3 | 4;
}) {
  const state = spec.state ?? { status: "ready" };
  const titleId = `${spec.id}-title`;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";

  // Carga y error no son plegables: no hay detalle que abrir todavía.
  if (state.status === "loading" || state.status === "error") {
    return (
      <section
        aria-labelledby={titleId}
        aria-busy={state.status === "loading" || undefined}
        className={`${CARD} flex flex-col gap-3 p-4`}
      >
        <PanelHead spec={spec} titleId={titleId} Heading={Heading} />
        {state.status === "loading" ? (
          <div className="flex flex-col gap-2">
            <span className="sr-only" role="status">
              Cargando {spec.title}…
            </span>
            <SkeletonLine className="w-2/5" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-lg border border-status-dropped bg-status-dropped/10 p-3"
          >
            <p className="text-sm text-status-dropped">
              <span aria-hidden>⚠ </span>
              {state.message ?? "No se han podido cargar estos datos."}
            </p>
            {state.retry}
          </div>
        )}
      </section>
    );
  }

  const derived = derive(spec);

  // Vacío: se DERIVA de que no haya ni una medida. Nunca se pinta como ceros, y
  // tampoco se deja plegar — no hay detalle detrás.
  //
  // Y se pinta ATENUADO: borde discontinuo, sin fondo y sin sombra. Una tarjeta
  // vacía con el mismo peso visual que una llena compite por la mirada igual
  // que ella, y en un muro de treinta paneles eso obliga a leer el texto de
  // cada una para descartarla. El discontinuo dice «aquí no hay nada» antes de
  // leer una palabra, y sin bajar la opacidad del texto: atenuar la tarjeta no
  // puede costar el contraste de lo único que explica por qué está vacía.
  if (derived.isEmpty) {
    return (
      <section
        aria-labelledby={titleId}
        className="flex flex-col gap-3 rounded-card border border-dashed border-border p-4"
      >
        <PanelHead spec={spec} titleId={titleId} Heading={Heading} />
        <div className="flex flex-col gap-1 py-1">
          <p className="text-sm text-muted-foreground">
            {spec.empty?.title ?? "Todavía no hay datos"}
          </p>
          {spec.empty?.message && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {spec.empty.message}
            </p>
          )}
        </div>
      </section>
    );
  }

  const hero = heroKpi(spec, derived);
  const lines = summaryLines(spec, derived);
  // El resto son los demás indicadores. Se descarta POR CLAVE, no por posición:
  // el que preside no tiene por qué ser el primero (ver `heroKpi`).
  const rest = spec.kpis?.filter((k) => k.key !== hero?.key) ?? [];
  const isTextual = TEXTUAL.includes(spec.viz);

  const highlight = isTextual ? "" : buildHighlight(spec, derived);
  const warning = state.status === "partial" ? state.message : null;

  // Aviso y gráfico salen igual en la cara y en la capa. El titular NO: en la
  // capa está el resumen entero, que ya lo contiene — repetirlo dejaba la misma
  // frase dos veces seguidas, palabra por palabra.
  const alert = warning && (
    <p className="rounded-lg border border-status-in-progress/40 bg-status-in-progress/10 px-2.5 py-1.5 text-[11px] text-foreground-soft">
      <span aria-hidden>⚠ </span>
      {warning}
    </p>
  );

  const selfDescribing = SELF_DESCRIBING.includes(spec.viz);

  // DOS gráficos, y no es un descuido: el de la cara es decorativo y el de la
  // capa se puede consultar punto a punto.
  //
  // En la cara no cabe otra cosa. El disparador del modal la cubre entera con
  // `absolute inset-0`, así que un tramo focalizable ahí quedaría debajo: el
  // ratón nunca lo alcanzaría y el teclado enfocaría algo invisible. Y `aria-
  // hidden` en la cara tampoco esconde nada — el resumen y la cifra que
  // presiden ya dicen el dato, y la capa lo repite entero.
  const faceplot = !isTextual && (
    <div aria-hidden className="pt-0.5">
      <Chart spec={spec} derived={derived} />
    </div>
  );

  // En la capa, `aria-hidden` SOLO en las que siguen siendo decorativas: ocultar
  // un gráfico que ya no tiene tabla detrás dejaría su dato fuera del alcance de
  // un lector de pantalla, que es lo contrario de lo que este sistema hace.
  const plot = !isTextual && (
    <div aria-hidden={PLAIN_VIZ.includes(spec.viz) || undefined} className="pt-0.5">
      <Chart spec={spec} derived={derived} interactive={selfDescribing} />
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      className={`${CARD} relative hover:border-accent/40`}
    >
      {/* ── CARA ─────────────────────────────────────────────────────────
          Sin nada interactivo dentro: el disparador de la capa la cubre
          entera y taparía cualquier enlace. Por eso el ranking recortado va
          sin enlaces — los completos, con los suyos, viven en la capa. */}
      <div className="flex flex-col gap-2.5 p-4">
        <PanelHead spec={spec} titleId={titleId} Heading={Heading} />
        {alert}
        {hero && <Hero kpi={hero} />}
        {/* Una frase: lo que DESTACA. El párrafo entero espera a la capa. */}
        {highlight && (
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {highlight}
          </p>
        )}
        {faceplot}
        <Legend derived={derived} spec={spec} />
        {spec.viz === "ranking" && (
          <RankingList spec={spec} limit={RANKING_PREVIEW} />
        )}
        <span aria-hidden className="label-section pt-0.5 text-accent/70">
          Ampliar ↗
        </span>
      </div>

      {/* ── CAPA ───────────────────────────────────────────────────────
          Orden de lectura: qué es · cuánto · qué dice · gráfico · valores
          exactos. El texto va ANTES del dibujo a propósito — quien no puede
          leer el gráfico no debería tener que saltárselo para llegar al dato. */}
      <PanelDialog title={spec.title} label={`Ampliar ${spec.title}`}>
        <div className="flex flex-col gap-3">
          <PanelHead
            spec={spec}
            titleId={`${spec.id}-dialog-title`}
            Heading={Heading}
          />
          {alert}
          {hero && <Hero kpi={hero} />}

          {spec.description && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {spec.description}
            </p>
          )}

          {lines.length > 0 && (
            <p className="text-[12.5px] leading-relaxed text-foreground-soft">
              {lines.join(" ")}
            </p>
          )}

          {rest.length > 0 && <KpiRow kpis={rest} />}

          {plot}
          <Legend derived={derived} spec={spec} />

          {/* El ranking completo: la cara solo enseñaba las primeras. */}
          {spec.viz === "ranking" && <RankingList spec={spec} />}

          {/* Los valores exactos. NO los repiten ni los paneles que ya son
              texto —su lista o su `<dl>` YA son el dato— ni los gráficos que
              escriben sus cifras dentro: duplicarlos solo obliga al lector de
              pantalla a oírlo dos veces, y en el calendario anual eran 365
              filas de las que 348 decían «0». */}
          {!isTextual && !selfDescribing && <PanelTable spec={spec} derived={derived} />}
          {spec.viz === "table" && <PanelTable spec={spec} derived={derived} />}

          <p className="text-[10.5px] leading-relaxed text-foreground-faint">
            {contextSentence(spec)}
          </p>

          {spec.note && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {spec.note}
            </p>
          )}

          {spec.actions && spec.actions.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {spec.actions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  {a.label} ›
                </Link>
              ))}
            </div>
          )}
        </div>
      </PanelDialog>
    </section>
  );
}

/**
 * Rótulo de contexto + título. El rótulo va ARRIBA y en mono: dice periodo y
 * unidad en cuatro palabras, en vez de la frase entera que antes ocupaba dos
 * líneas en cada tarjeta. El alcance («Ahora mismo») viaja aquí y no en el
 * desplegable: un panel que no obedece al filtro de la página tiene que decirlo
 * ANTES de que nadie lea su cifra, o miente por omisión.
 */
function PanelHead({
  spec,
  titleId,
  Heading,
}: {
  spec: PanelSpec;
  titleId: string;
  Heading: "h2" | "h3" | "h4";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="label-section">
        {spec.context.period}
        {spec.context.filter ? ` · ${spec.context.filter}` : ""}
        {spec.context.scope ? ` · ${spec.context.scope}` : ""} · {spec.unit.short}
      </span>
      <Heading
        id={titleId}
        className="font-serif text-[15px] leading-tight font-semibold text-foreground"
      >
        {spec.title}
      </Heading>
    </div>
  );
}

/** La cifra que preside la tarjeta. `<dl>` de verdad, no un número suelto. */
function Hero({ kpi }: { kpi: PanelKpi }) {
  const value = kpi.text ?? formatValue(kpi.value, kpi.unit);
  const good = kpi.delta ? deltaIsGood(kpi.delta) : undefined;
  return (
    <dl className="flex flex-col gap-0.5">
      <dd
        className={`font-serif text-[32px] leading-none font-semibold tracking-tight ${
          value === NO_DATA ? "text-foreground-faint" : "text-foreground"
        }`}
      >
        {value}
      </dd>
      <dt className="text-[11px] text-muted-foreground">{kpi.label}</dt>
      {kpi.delta && (
        <dd
          className={`text-[11px] ${
            good === undefined
              ? "text-muted-foreground"
              : good
                ? "text-status-completed"
                : "text-status-dropped"
          }`}
        >
          <span aria-hidden>{deltaGlyph(kpi.delta)} </span>
          {formatDelta(kpi.delta)}
        </dd>
      )}
    </dl>
  );
}

/** El resto de indicadores, ya en el desplegable. */
function KpiRow({ kpis }: { kpis: PanelKpi[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {kpis.map((k) => {
        const value = k.text ?? formatValue(k.value, k.unit);
        const good = k.delta ? deltaIsGood(k.delta) : undefined;
        return (
          <div key={k.key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[10.5px] text-muted-foreground">{k.label}</dt>
            <dd className="flex flex-col gap-0.5">
              <span
                className={`font-serif text-xl leading-none font-semibold ${
                  value === NO_DATA ? "text-foreground-faint" : "text-foreground"
                }`}
              >
                {value}
              </span>
              {k.delta && (
                <span
                  className={`text-[10.5px] ${
                    good === undefined
                      ? "text-muted-foreground"
                      : good
                        ? "text-status-completed"
                        : "text-status-dropped"
                  }`}
                >
                  {/* Glifo + palabra + unidad + periodo: cuatro señales, no un color. */}
                  <span aria-hidden>{deltaGlyph(k.delta)} </span>
                  {formatDelta(k.delta)}
                </span>
              )}
              {k.hint && (
                <span className="text-[10px] text-foreground-faint">{k.hint}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Ranking: lista ordenada de verdad, la posición la pone `<ol>`. La cara enseña
 * las primeras; la capa, todas.
 *
 * Sin enlaces cuando está recortada: esa versión vive en la cara, bajo el
 * disparador que cubre la tarjeta, así que serían enlaces intocables.
 */
function RankingList({ spec, limit }: { spec: PanelSpec; limit?: number }) {
  const rows = limit ? spec.data.slice(0, limit) : spec.data;
  return (
    <ol className="flex flex-col">
      {rows.map((d) => (
        <li
          key={d.key}
          className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-0"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
            {d.href && !limit ? (
              <Link href={d.href} className="hover:text-accent hover:underline">
                {d.label}
              </Link>
            ) : (
              d.label
            )}
            {d.detail && (
              <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                {d.detail}
              </span>
            )}
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatValue(d.value, spec.unit)}
          </span>
        </li>
      ))}
      {limit && spec.data.length > limit && (
        <li className="pt-1.5 text-[10.5px] text-foreground-faint">
          y {formatNumber(spec.data.length - limit)} más
        </li>
      )}
    </ol>
  );
}
