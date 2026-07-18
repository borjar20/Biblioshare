import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SearchIcon } from "@/components/ui/icons";
import { FiltersDropdown } from "@/components/library/filters-dropdown";

const TYPES: ItemType[] = ["book", "movie", "series"];
const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];
const SORTS: LibrarySort[] = ["recent", "rating", "title"];

// Píldora de tipo (prominente): la elección más "de un vistazo".
function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}

// Segmento compacto (`.sortrow .s` del mockup): estado y orden, menudos, sin
// fondo salvo el activo — pesan mucho menos que las píldoras grandes de antes.
function segClass(active: boolean) {
  return `rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "bg-surface-muted text-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`;
}

export async function LibraryFilters({
  itemType,
  status,
  search,
  sort = "recent",
  basePath,
  showTypeFilter = true,
  extraParams,
}: {
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort?: LibrarySort;
  basePath: string;
  showTypeFilter?: boolean;
  extraParams?: Record<string, string>;
}) {
  const t = await getTranslations();

  function buildHref(next: {
    type?: ItemType;
    status?: MediaStatus;
    sort?: LibrarySort;
  }) {
    const params = new URLSearchParams(extraParams);
    const nextType = "type" in next ? next.type : itemType;
    const nextStatus = "status" in next ? next.status : status;
    const nextSort = "sort" in next ? next.sort : sort;
    if (nextType) params.set("type", nextType);
    if (nextStatus) params.set("status", nextStatus);
    if (nextSort && nextSort !== "recent") params.set("sort", nextSort);
    if (search) params.set("q", search);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  // «Limpiar»: conserva la búsqueda (y extraParams como la pestaña), quita
  // tipo/estado/orden.
  function clearHref() {
    const params = new URLSearchParams(extraParams);
    if (search) params.set("q", search);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  const activeCount =
    (showTypeFilter && itemType ? 1 : 0) +
    (status ? 1 : 0) +
    (sort !== "recent" ? 1 : 0);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Búsqueda: píldora con la lupa dentro y SIN botón aparte (Enter envía) —
          ocupa una fila menos. */}
      <form action={basePath} className="relative">
        {itemType && <input type="hidden" name="type" value={itemType} />}
        {status && <input type="hidden" name="status" value={status} />}
        {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
        {extraParams &&
          Object.entries(extraParams).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder={t("library.search.placeholder")}
          aria-label={t("library.search.submit")}
          className="w-full rounded-full border border-border bg-surface py-2 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
        />
      </form>

      {/* Tipo · estado · orden plegados en un desplegable «Filtros» (igual que el
          detalle de colección). Los controles son enlaces: el filtrado de Todo
          es server-side por la URL (getLibraryItems). */}
      <FiltersDropdown label={t("collection.filters")} activeCount={activeCount}>
        {showTypeFilter && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("collection.filterType")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Link href={buildHref({ type: undefined })} className={pillClass(!itemType)}>
                {t("library.filters.allTypes")}
              </Link>
              {TYPES.map((type) => (
                <Link key={type} href={buildHref({ type })} className={pillClass(itemType === type)}>
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${itemType === type ? "bg-accent-foreground" : MEDIA_ACCENT[type].bg}`}
                  />
                  {t(`search.types.${type}`)}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {t("collection.filterStatus")}
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            <Link href={buildHref({ status: undefined })} className={segClass(!status)}>
              {t("library.filters.allStatuses")}
            </Link>
            {STATUSES.map((s) => (
              <Link key={s} href={buildHref({ status: s })} className={segClass(status === s)}>
                {t(`library.status.${s}`)}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {t("collection.filterSort")}
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            {SORTS.map((s) => (
              <Link key={s} href={buildHref({ sort: s })} className={segClass(sort === s)}>
                {t(`library.sort.${s}`)}
              </Link>
            ))}
          </div>
        </div>

        {activeCount > 0 && (
          <Link
            href={clearHref()}
            className="self-start text-[11px] font-medium text-accent hover:underline"
          >
            {t("collection.clearFilters")}
          </Link>
        )}
      </FiltersDropdown>
    </div>
  );
}
