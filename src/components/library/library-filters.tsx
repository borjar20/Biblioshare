import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { SearchIcon } from "@/components/ui/icons";
import { FiltersDropdown } from "@/components/library/filters-dropdown";
import { ALL_TYPES_PARAM } from "@/lib/library/effective-type";

const TYPES: ItemType[] = ["book", "movie", "series"];
const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];
// Las películas solo tienen dos estados (pendiente/vista, ver StatusSegments):
// al filtrar por tipo "movie" no ofrecemos "en curso" ni "abandonado".
const MOVIE_STATUSES: MediaStatus[] = ["planned", "completed"];
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
  genre,
  genres,
  basePath,
  showTypeFilter = true,
  extraParams,
}: {
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort?: LibrarySort;
  /** Slug del género activo (@/lib/catalog/genre-vocab). */
  genre?: string;
  /** Géneros presentes en la biblioteca del usuario, ya cargados por la page (getUserGenres). */
  genres?: { slug: string; label: string; count: number }[];
  basePath: string;
  showTypeFilter?: boolean;
  extraParams?: Record<string, string>;
}) {
  const t = await getTranslations();

  function buildHref(next: {
    // `ALL_TYPES_PARAM` ("todos") es el centinela explícito de «todos los tipos»
    // (issue #313): distinto de omitir `type`, que la página interpreta como
    // arranque por defecto (posible tipo preferido del onboarding).
    type?: ItemType | typeof ALL_TYPES_PARAM;
    status?: MediaStatus;
    sort?: LibrarySort;
    genre?: string;
  }) {
    const params = new URLSearchParams(extraParams);
    const nextType = "type" in next ? next.type : itemType;
    const nextStatus = "status" in next ? next.status : status;
    const nextSort = "sort" in next ? next.sort : sort;
    const nextGenre = "genre" in next ? next.genre : genre;
    if (nextType) params.set("type", nextType);
    if (nextStatus) params.set("status", nextStatus);
    if (nextSort && nextSort !== "recent") params.set("sort", nextSort);
    if (nextGenre) params.set("genero", nextGenre);
    if (search) params.set("q", search);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  // «Limpiar»: conserva la búsqueda (y extraParams como la pestaña), quita
  // tipo/estado/orden/género.
  function clearHref() {
    const params = new URLSearchParams(extraParams);
    if (search) params.set("q", search);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  const activeCount =
    (showTypeFilter && itemType ? 1 : 0) +
    (status ? 1 : 0) +
    (sort !== "recent" ? 1 : 0) +
    (genre ? 1 : 0);

  return (
    // Barra de una sola fila en sm+: buscador a la izquierda (topado, que a
    // 1600px de shell ancho un `w-full` daba una píldora de metro y medio) y
    // «Filtros» pegado al borde derecho de la rejilla. En móvil siguen apilados.
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      {/* Búsqueda: píldora con la lupa dentro y SIN botón aparte (Enter envía) —
          ocupa una fila menos. */}
      <form action={basePath} className="relative w-full sm:max-w-xl sm:flex-1">
        {/* Buscar conserva el ámbito de tipo actual: el tipo concreto, o el
            centinela `todos` cuando la vista es «todos los tipos» — si no,
            buscar desde «Todo» revertiría al tipo preferido (issue #313). */}
        <input type="hidden" name="type" value={itemType ?? ALL_TYPES_PARAM} />
        {status && <input type="hidden" name="status" value={status} />}
        {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
        {genre && <input type="hidden" name="genero" value={genre} />}
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
            <span className="label-section">
              {t("collection.filterType")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {/* «Todos los tipos» emite el centinela `type=todos`, no la
                  ausencia de `type`: solo así escapa del tipo preferido del
                  onboarding en la pestaña Todo (issue #313). */}
              <Link href={buildHref({ type: ALL_TYPES_PARAM })} className={pillClass(!itemType)}>
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
          <span className="label-section">
            {t("collection.filterStatus")}
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            <Link href={buildHref({ status: undefined })} className={segClass(!status)}>
              {t("library.filters.allStatuses")}
            </Link>
            {(itemType === "movie" ? MOVIE_STATUSES : STATUSES).map((s) => (
              <Link key={s} href={buildHref({ status: s })} className={segClass(status === s)}>
                {/* El verbo "completado" cambia por medio: en película es
                    "Vista", igual que el control de Registro (StatusSegments) y
                    el badge del hero. El filtro genérico usa library.status.*
                    para el resto; solo "completed" de película se traduce con
                    la clave por-medio para no decir "Completado" donde toda la
                    UI de pelis dice "Vista". */}
                {itemType === "movie" && s === "completed"
                  ? t("detail.statusSegments.completed.movie")
                  : t(`library.status.${s}`)}
              </Link>
            ))}
          </div>
        </div>

        {genres && genres.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="label-section">
              {t("collection.filterGenre")}
            </span>
            <div className="flex flex-wrap items-center gap-0.5">
              <Link href={buildHref({ genre: undefined })} className={segClass(!genre)}>
                {t("library.filters.allGenres")}
              </Link>
              {genres.map((g) => (
                <Link key={g.slug} href={buildHref({ genre: g.slug })} className={segClass(genre === g.slug)}>
                  {g.label} <span className="opacity-60">{g.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="label-section">
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
