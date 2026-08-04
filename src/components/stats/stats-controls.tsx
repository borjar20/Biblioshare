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
 * Cada grupo es un `<nav>` con su nombre accesible y marca el activo con
 * `aria-current`, que es lo que hace que un lector de pantalla anuncie cuál
 * está puesto — el color de fondo por sí solo no lo dice.
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
  period: StatsPeriod;
  itemFilter: ItemFilter;
  metric: ActivityMetric;
}) {
  function href(next: Partial<{ periodo: string; tipo: string; medida: string }>): string {
    const params = new URLSearchParams({
      ...baseParams,
      periodo: periodParam(period),
      tipo: itemFilterParam(itemFilter),
      medida: activityMetricParam(metric),
      ...next,
    });
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <Group label="Periodo">
        {availablePeriods().map((p) => (
          <Pill
            key={String(p)}
            href={href({ periodo: periodParam(p) })}
            active={p === period}
            label={periodPillLabel(p)}
          />
        ))}
      </Group>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Group label="Tipo de obra">
          {ITEM_FILTERS.map((f) => (
            <Pill
              key={f}
              href={href({ tipo: itemFilterParam(f) })}
              active={f === itemFilter}
              label={itemFilterLabel(f)}
              small
            />
          ))}
        </Group>

        <Group label="Magnitud de la actividad">
          {(["works", "time"] as ActivityMetric[]).map((m) => (
            <Pill
              key={m}
              href={href({ medida: activityMetricParam(m) })}
              active={m === metric}
              label={activityMetricLabel(m)}
              small
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
      {children}
    </nav>
  );
}

function Pill({
  href,
  active,
  label,
  small = false,
}: {
  href: string;
  active: boolean;
  label: string;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border transition-colors ${
        small ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-sm"
      } font-medium ${
        active
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
