import Link from "next/link";
import {
  type ActivityMetric,
  type ItemFilter,
  ITEM_FILTERS,
  activityMetricLabel,
  activityMetricParam,
  itemFilterLabel,
  itemFilterParam,
} from "@/lib/stats/filter";
import {
  type StatsPeriod,
  availablePeriods,
  periodParam,
  periodPillLabel,
} from "@/lib/stats/period";

/**
 * Los tres controles de una vista de estadísticas: periodo, tipo de obra y la
 * magnitud de la actividad. UNA fila para toda la pantalla — nunca un filtro
 * por panel: con dos filtros distintos a la vez, nadie puede saber qué compara
 * cada cifra con cuál.
 *
 * Son ENLACES, no estado de cliente. El servidor ya tiene que consultar de
 * nuevo para cambiar de periodo, así que un `<button>` con estado solo añadiría
 * JavaScript para acabar navegando igual; y así la selección se puede compartir,
 * sobrevive a recargar y funciona sin JS.
 *
 * Van en GRUPOS SEGMENTADOS (una cápsula por grupo, activo en relleno) y no en
 * botones sueltos con aire entre ellos. Con tres grupos en dos filas, los huecos
 * dentro de un grupo y los huecos entre grupos medían casi lo mismo, así que
 * «Series» y «Obras» parecían opciones de la misma pregunta. La cápsula dice
 * dónde empieza y acaba cada decisión, y el separador vertical entre «Tipo de
 * obra» y «Magnitud» remata que son dos independientes en la misma línea.
 *
 * Cada grupo es un `<nav>` con su nombre accesible y marca el activo con
 * `aria-current`, que es lo que hace que un lector de pantalla anuncie cuál está
 * puesto — el relleno por sí solo no lo dice.
 *
 * `period` e `itemFilter` son OPCIONALES: donde no se pasan, su grupo no se
 * pinta ni viaja en el enlace. Es lo que usa la pestaña del perfil, que está
 * fijada al mes y a todos los tipos —ahí la pregunta ya está hecha y lo único
 * que se elige es en qué magnitud verla—. Un selector que no cambia nada es
 * peor que no tenerlo: promete un control que no existe.
 */
export function StatsControls({
  basePath,
  baseParams,
  period,
  itemFilter,
  metric,
}: {
  basePath: string;
  /** Parámetros que hay que conservar al navegar (p. ej. `tab`, `month`). */
  baseParams?: Record<string, string>;
  period?: StatsPeriod;
  itemFilter?: ItemFilter;
  metric: ActivityMetric;
}) {
  function href(next: Partial<{ periodo: string; tipo: string; medida: string }>): string {
    const params = new URLSearchParams({
      ...baseParams,
      ...(period !== undefined ? { periodo: periodParam(period) } : {}),
      ...(itemFilter !== undefined ? { tipo: itemFilterParam(itemFilter) } : {}),
      medida: activityMetricParam(metric),
      ...next,
    });
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {period !== undefined && (
        <Group label="Periodo">
          {availablePeriods().map((p) => (
            <Segment
              key={String(p)}
              href={href({ periodo: periodParam(p) })}
              active={p === period}
              label={periodPillLabel(p)}
            />
          ))}
        </Group>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {itemFilter !== undefined && (
          <>
            <Group label="Tipo de obra">
              {ITEM_FILTERS.map((f) => (
                <Segment
                  key={f}
                  href={href({ tipo: itemFilterParam(f) })}
                  active={f === itemFilter}
                  label={itemFilterLabel(f)}
                />
              ))}
            </Group>

            {/* Dos decisiones distintas en la misma línea: la raya lo dice sin
                gastar otra fila. Decorativa — cada grupo ya se nombra solo. */}
            <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          </>
        )}

        <Group label="Magnitud">
          {(["works", "time"] as ActivityMetric[]).map((m) => (
            <Segment
              key={m}
              href={href({ medida: activityMetricParam(m) })}
              active={m === metric}
              label={activityMetricLabel(m)}
            />
          ))}
        </Group>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="label-section shrink-0">{label}</span>
      <span className="inline-flex gap-px rounded-full border border-border bg-surface p-[3px]">
        {children}
      </span>
    </nav>
  );
}

function Segment({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3 py-1 text-[12.5px] whitespace-nowrap transition-colors ${
        active
          ? "bg-accent font-semibold text-accent-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
