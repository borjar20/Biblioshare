"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { LibraryItem, MediaStatus } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { ChevronDownIcon } from "@/components/ui/icons";

const TYPES: ItemType[] = ["book", "movie", "series"];
const STATUSES: MediaStatus[] = ["planned", "in_progress", "completed", "dropped"];
const SORTS = ["recent", "rating", "title"] as const;
type Sort = (typeof SORTS)[number];

function pillClass(active: boolean) {
  return `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}
function segClass(active: boolean) {
  return `rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
    active
      ? "bg-surface-muted text-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`;
}

// Ítems de una colección (frame B) con un DESPLEGABLE de filtros (tipo · estado
// · orden, como en Todo). Filtrado en CLIENTE: una colección tiene pocos ítems,
// así que no merece viajar al server ni meter los filtros en la URL — todo el
// conjunto llega ya en `items` y aquí se recorta/ordena en memoria.
export function CollectionItems({ items }: { items: LibraryItem[] }) {
  const t = useTranslations();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ItemType | null>(null);
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
      <div ref={rootRef} className="relative flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {activeCount > 0
            ? t("collection.filterCount", { shown: filtered.length, total: items.length })
            : ""}
        </span>

        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          {t("collection.filters")}
          {activeCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-accent-foreground">
              {activeCount}
            </span>
          )}
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute top-[42px] right-0 z-50 flex w-[min(280px,92vw)] flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-card"
          >
            {/* Tipo */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
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
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {t("collection.filterStatus")}
              </span>
              <div className="flex flex-wrap items-center gap-0.5">
                <button type="button" onClick={() => setStatus(null)} className={segClass(!status)}>
                  {t("library.filters.allStatuses")}
                </button>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={segClass(status === s)}
                  >
                    {t(`library.status.${s}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Orden */}
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
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
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("collection.noMatch")}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3.5">
          {filtered.map((item) => (
            <LibraryItemCard
              key={item.entryId}
              item={item}
              isOwner={false}
              inCollection
            />
          ))}
        </div>
      )}
    </div>
  );
}
