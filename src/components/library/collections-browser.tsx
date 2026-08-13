"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { CollectionCard as CollectionCardData } from "@/lib/library/collections";
import {
  COLLECTION_SORTS,
  browseCollections,
  type CollectionBrowseSort,
} from "@/lib/library/collection-browse";
import { CollectionCard } from "./collection-card";
import { NewCollectionButton } from "./new-collection-button";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon, SearchIcon } from "@/components/ui/icons";
import { segClass } from "@/lib/ui/control-classes";
import { TILE_GRID_COLS } from "@/lib/ui/layout";

// Rejilla de Colecciones con búsqueda y orden. Filtrado en CLIENTE, igual que
// `CollectionItems` (el detalle de una colección): las colecciones llegan todas
// en la misma consulta, así que recortar en memoria es instantáneo y no hay
// nada que ganar metiéndolo en la URL.
//
// El input de búsqueda NO se llama `q` a propósito: `q` es el buscador de
// BIBLIOTECA de la pestaña `Todo`, que sí es server-side y sí va a la URL. Dos
// campos con el mismo nombre en pestañas hermanas se confunden solos (y hay un
// e2e que distingue las dos pestañas justo por ese selector).
export function CollectionsBrowser({ cards }: { cards: CollectionCardData[] }) {
  const t = useTranslations("collection");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CollectionBrowseSort>("custom");

  const shown = useMemo(
    () => browseCollections(cards, query, sort),
    [cards, query, sort],
  );

  // Sin ninguna colección no se pinta ni la barra: no hay nada que buscar ni
  // que ordenar, y el estado vacío es quien tiene que invitar a crear la
  // primera (ese papel lo hacía antes el tile punteado del final del grid).
  if (cards.length === 0) {
    return (
      <EmptyState
        glyph={<InboxIcon className="h-7 w-7" />}
        title={t("emptyTitle")}
        message={t("emptyBody")}
        action={<NewCollectionButton />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="relative w-full sm:max-w-sm">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            name="coleccion-q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="w-full rounded-full border border-border bg-surface py-2 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
          />
        </div>

        <div
          role="group"
          aria-label={t("sortLabel")}
          className="flex flex-wrap items-center gap-0.5"
        >
          {COLLECTION_SORTS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSort(option)}
              aria-pressed={sort === option}
              className={segClass(sort === option)}
            >
              {t(`sort.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("noMatchCollections")}
        </p>
      ) : (
        <div className={`grid gap-4 ${TILE_GRID_COLS}`}>
          {shown.map((card) => (
            <CollectionCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
