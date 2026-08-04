import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/ui/icons";
import { FiltersDropdown } from "@/components/library/filters-dropdown";
import {
  TYPE_TO_FIELD,
  type SagaIndexFilterParams,
  type SagaIndexType,
  type SagaIndexView,
} from "@/lib/sagas/filter-saga-index";

const VIEWS: SagaIndexView[] = ["todas", "sigo", "universos"];
const TYPES: SagaIndexType[] = ["libro", "pelicula", "serie"];

function segClass(active: boolean) {
  return `flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium whitespace-nowrap transition-colors ${
    active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
  }`;
}

function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}

export async function SagaIndexFilters({
  search,
  params,
}: {
  search?: string;
  params: SagaIndexFilterParams;
}) {
  const t = await getTranslations("sagaIndex");
  const tSearch = await getTranslations("search");

  function buildHref(next: Partial<SagaIndexFilterParams>) {
    const merged = { ...params, ...next };
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (merged.vista !== "todas") qs.set("vista", merged.vista);
    if (merged.tipos.length > 0) qs.set("tipo", merged.tipos.join(","));
    if (merged.itinerarios) qs.set("itinerarios", "1");
    if (merged.coleccion) qs.set("coleccion", "1");
    if (merged.min5) qs.set("min5", "1");
    const qsStr = qs.toString();
    return `/sagas${qsStr ? `?${qsStr}` : ""}`;
  }

  function toggleTypeHref(type: SagaIndexType) {
    const tipos = params.tipos.includes(type)
      ? params.tipos.filter((x) => x !== type)
      : [...params.tipos, type];
    return buildHref({ tipos });
  }

  const activeCount =
    params.tipos.length +
    (params.itinerarios ? 1 : 0) +
    (params.coleccion ? 1 : 0) +
    (params.min5 ? 1 : 0);

  return (
    // Una sola fila a partir de `sm`, como la barra del mockup: buscador
    // acotado + vista + Filtros. A ancho completo (1152 px) un buscador
    // estirado de lado a lado desperdicia la fila y desequilibra la barra.
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
      {/* Búsqueda server por query param (GET), patrón /buscar. */}
      <form action="/sagas" className="relative sm:w-[280px] sm:shrink-0">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-full border border-border bg-surface py-2 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </form>

      {/* En móvil (<sm) apila: segmentado ancho completo, luego Filtros —
          spec Fase 5. En sm+ comparten fila con el buscador. */}
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full rounded-lg bg-surface-muted p-1 sm:w-auto">
          {VIEWS.map((v) => (
            <Link key={v} href={buildHref({ vista: v })} className={segClass(params.vista === v)}>
              {t(`view.${v}`)}
            </Link>
          ))}
        </div>

        <FiltersDropdown label={t("filtersLabel")} activeCount={activeCount}>
          <div className="flex flex-col gap-1.5">
            <span className="label-section">
              {t("filterTypeLabel")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((type) => (
                <Link key={type} href={toggleTypeHref(type)} className={pillClass(params.tipos.includes(type))}>
                  {tSearch(`types.${TYPE_TO_FIELD[type]}`)}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="label-section">
              {t("filterOtherLabel")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Link href={buildHref({ itinerarios: !params.itinerarios })} className={pillClass(params.itinerarios)}>
                {t("filterItineraries")}
              </Link>
              <Link href={buildHref({ coleccion: !params.coleccion })} className={pillClass(params.coleccion)}>
                {t("filterCollection")}
              </Link>
              <Link href={buildHref({ min5: !params.min5 })} className={pillClass(params.min5)}>
                {t("filterMin5")}
              </Link>
            </div>
          </div>

          {activeCount > 0 && (
            <Link
              href={buildHref({ tipos: [], itinerarios: false, coleccion: false, min5: false })}
              className="self-start text-[11px] font-medium text-accent hover:underline"
            >
              {t("clearFilters")}
            </Link>
          )}
        </FiltersDropdown>
      </div>
    </div>
  );
}
