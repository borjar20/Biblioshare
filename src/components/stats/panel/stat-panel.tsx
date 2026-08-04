// El armazón único de TODOS los paneles estadísticos. Un panel no es un
// componente a medida: es este armazón + un `PanelSpec`.
//
// Orden de lectura, que es también el orden del DOM (1 → 10):
//   1 cabecera · 2 contexto · 3 resumen · 4 indicadores · 5 visualización
//   6 selector de vista · 7 tabla · 8 notas · 9 estados · 10 acciones
//
// La decisión que sostiene la accesibilidad: **el gráfico es decorativo**
// (`aria-hidden`) y la tabla es el dato. Así el valor exacto existe una sola
// vez en el árbol accesible; la alternativa —poner `aria-label` en cada barra—
// duplica cada cifra y las dos copias se separan al primer cambio.

import Link from "next/link";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { derive } from "@/lib/stats/panel/derive";
import {
  deltaGlyph,
  deltaIsGood,
  formatDelta,
  formatNumber,
  formatValue,
  NO_DATA,
} from "@/lib/stats/panel/format";
import { buildSummary } from "@/lib/stats/panel/summary";
import type { PanelKpi, PanelSpec } from "@/lib/stats/panel/types";
import { Chart, Legend } from "./charts";
import { contextSentence, PanelTable } from "./panel-table";

/** Visualizaciones que YA son texto: no llevan gráfico decorativo ni tabla aparte. */
const TEXTUAL: PanelSpec["viz"][] = ["ranking", "kpi", "table"];

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

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={state.status === "loading" || undefined}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
    >
      {/* 1 · Cabecera + 10 · acciones */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Heading id={titleId} className="font-serif text-sm font-semibold text-foreground">
          {spec.title}
        </Heading>
        {spec.actions?.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-accent"
          >
            {a.label}
          </Link>
        ))}
      </div>

      {/* 2 · Contexto: periodo, filtros y unidades. Siempre, aunque no haya datos. */}
      <p className="font-mono text-[10.5px] leading-snug text-muted-foreground">
        {contextSentence(spec)}
      </p>

      {/* Ayuda: qué mide y cómo se calcula. Va antes del dato, no en nota al pie,
          porque cambia cómo se interpreta la cifra que viene a continuación. */}
      {spec.description && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {spec.description}
        </p>
      )}

      <PanelBody spec={spec} state={state} />

      {/* 8 · Notas e interpretación */}
      {spec.note && state.status !== "loading" && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{spec.note}</p>
      )}
    </section>
  );
}

function PanelBody({
  spec,
  state,
}: {
  spec: PanelSpec;
  state: NonNullable<PanelSpec["state"]>;
}) {
  // 9 · Estados —————————————————————————————————————————————————
  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2">
        <span className="sr-only" role="status">
          Cargando {spec.title}…
        </span>
        <SkeletonLine className="w-4/5" />
        <SkeletonLine className="w-3/5" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
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
    );
  }

  const derived = derive(spec);

  // Vacío: se DERIVA de que no haya ni una medida. Nunca se pinta como ceros.
  if (derived.isEmpty) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <p className="text-sm text-foreground">{spec.empty?.title ?? "Todavía no hay datos"}</p>
        {spec.empty?.message && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {spec.empty.message}
          </p>
        )}
      </div>
    );
  }

  const summary = buildSummary(spec, derived);
  const isTextual = TEXTUAL.includes(spec.viz);

  return (
    <>
      {/* Datos parciales: se avisa ANTES de enseñar la cifra, no en una nota al pie. */}
      {state.status === "partial" && (
        <p className="rounded-lg border border-status-in-progress/40 bg-status-in-progress/10 px-2.5 py-1.5 text-[11px] text-foreground-soft">
          <span aria-hidden>⚠ </span>
          {state.message}
        </p>
      )}

      {/* 3 · Resumen textual */}
      {summary && (
        <p className="text-[12.5px] leading-relaxed text-foreground-soft">{summary}</p>
      )}

      {/* 4 · Indicadores clave */}
      {spec.kpis && spec.kpis.length > 0 && <KpiRow kpis={spec.kpis} />}

      {/* 5 · Visualización (decorativa) */}
      {!isTextual && (
        <div aria-hidden className="pt-1">
          <Chart spec={spec} derived={derived} />
        </div>
      )}
      <Legend derived={derived} />

      {spec.viz === "ranking" && <RankingList spec={spec} />}

      {/* 6 · Selector de vista + 7 · tabla. `<details>` es el control nativo:
          accesible con teclado y anunciado como desplegable sin una línea de JS.
          Los paneles que ya son texto no repiten la tabla. */}
      {!isTextual && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] text-muted-foreground underline underline-offset-2 hover:text-accent">
            <span aria-hidden className="mr-1 inline-block group-open:rotate-90">
              ›
            </span>
            Ver los {formatNumber(spec.data.length)} valores exactos
          </summary>
          <div className="pt-2">
            <PanelTable spec={spec} derived={derived} />
          </div>
        </details>
      )}

      {/* 6 bis · La tabla de un panel `table` no se pliega: es su vista principal. */}
      {spec.viz === "table" && <PanelTable spec={spec} derived={derived} />}
    </>
  );
}

/**
 * Indicadores clave. `<dl>` porque son pares término/valor de verdad, y el
 * lector de pantalla los recorre como tales.
 */
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
                className={`font-serif text-2xl leading-none font-semibold ${
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

/** Ranking: lista ordenada de verdad. La posición la pone `<ol>`, no un número pintado. */
function RankingList({ spec }: { spec: PanelSpec }) {
  return (
    <ol className="flex flex-col">
      {spec.data.map((d) => (
        <li
          key={d.key}
          className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {d.href ? (
              <Link href={d.href} className="hover:text-accent hover:underline">
                {d.label}
              </Link>
            ) : (
              d.label
            )}
            {d.detail && (
              <span className="ml-1.5 text-[11px] text-muted-foreground">{d.detail}</span>
            )}
          </span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {formatValue(d.value, spec.unit)}
          </span>
        </li>
      ))}
    </ol>
  );
}
