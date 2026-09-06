"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LibraryItem, MediaStatus } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { FiltersDropdown } from "@/components/library/filters-dropdown";
import { HiddenDroppedNote } from "@/components/library/hidden-dropped-note";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { COVER_GRID_COLS } from "@/lib/ui/layout";
import { pillClass, segClass } from "@/lib/ui/control-classes";

const TYPES: ItemType[] = ["book", "movie", "series"];
const STATUSES: MediaStatus[] = ["planned", "in_progress", "completed", "dropped"];
const SORTS = ["recent", "rating", "title"] as const;
type Sort = (typeof SORTS)[number];

// Ítems de una colección (frame B) con un DESPLEGABLE de filtros (tipo · estado
// · orden, como en Todo). Filtrado en CLIENTE: una colección tiene pocos ítems,
// así que no merece viajar al server ni meter los filtros en la URL — todo el
// conjunto llega ya en `items` y aquí se recorta/ordena en memoria.
export function CollectionItems({
  items,
  hiddenDropped,
  showDroppedHref,
}: {
  items: LibraryItem[];
  hiddenDropped: number;
  /** Enlace que devuelve los abandonados a esta ficha (`?abandonados=1`). */
  showDroppedHref: string;
}) {
  const t = useTranslations();
  const [type, setType] = useState<ItemType | null>(null);
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [sort, setSort] = useState<Sort>("recent");

  const activeCount =
    (type ? 1 : 0) + (status ? 1 : 0) + (sort !== "recent" ? 1 : 0);

  const filtered = useMemo(() => {
    let arr = items.filter(
      (it) =>
        (!type || it.itemType === type) && (!status || it.status === status),
    );
    if (sort === "rating") {
      arr = [...arr].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    } else if (sort === "title") {
      arr = [...arr].sort((a, b) => a.title.localeCompare(b.title));
    }
    // "recent": se conserva el orden con que llega (position/added_at).
    return arr;
  }, [items, type, status, sort]);

  function clearAll() {
    setType(null);
    setStatus(null);
    setSort("recent");
  }

  return (
    <div className="flex flex-col gap-3.5">
      <FiltersDropdown
        label={t("collection.filters")}
        activeCount={activeCount}
        countLabel={t("collection.filterCount", { shown: filtered.length, total: items.length })}
      >
        {/* Tipo */}
        <div className="flex flex-col gap-1.5">
          <span className="label-section">
            {t("collection.filterType")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setType(null)} className={pillClass(!type)}>
              {t("library.filters.allTypes")}
            </button>
            {TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => setType(ty)}
                className={pillClass(type === ty)}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${type === ty ? "bg-accent-foreground" : MEDIA_ACCENT[ty].bg}`}
                />
                {t(`search.types.${ty}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Estado */}
        <div className="flex flex-col gap-1.5">
          <span className="label-section">
            {t("collection.filterStatus")}
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            <button type="button" onClick={() => setStatus(null)} className={segClass(!status)}>
              {t("library.filters.allStatuses")}
            </button>
            {STATUSES.map((s) => {
              // Con abandonados ocultos, «Abandonado» NO puede ser un filtro de
              // cliente: filtraría un array del que ya se quitaron, y devolvería
              // «Sin resultados». Pasa a ser el enlace que los trae de vuelta —
              // pedir «Abandonado» siempre enseña abandonados (spec D5, D10).
              if (s === "dropped" && hiddenDropped > 0) {
                return (
                  <Link key={s} href={showDroppedHref} className={segClass(false)}>
                    {t(`library.status.${s}`)}
                  </Link>
                );
              }
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={segClass(status === s)}
                >
                  {t(`library.status.${s}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Orden */}
        <div className="flex flex-col gap-1.5">
          <span className="label-section">
            {t("collection.filterSort")}
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            {SORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={segClass(sort === s)}
              >
                {t(`library.sort.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="self-start text-[11px] font-medium text-accent hover:underline"
          >
            {t("collection.clearFilters")}
          </button>
        )}
      </FiltersDropdown>

      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("collection.noMatch")}
        </p>
      ) : (
        <div className={`grid gap-3.5 ${COVER_GRID_COLS}`}>
          {filtered.map((item) => (
            <LibraryItemCard
              key={item.entryId}
              item={item}
              isOwner={false}
            />
          ))}
        </div>
      )}

      <HiddenDroppedNote count={hiddenDropped} href={showDroppedHref} />
    </div>
  );
}
