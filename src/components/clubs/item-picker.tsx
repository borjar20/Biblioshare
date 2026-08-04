"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import type { ItemType, SearchResult } from "@/lib/catalog/types";
import { loadMyLibraryItems, searchCatalogItems, resolveCatalogItem } from "./activity-actions";

// Lo que devuelve el picker sea cual sea la fuente: el uuid LOCAL de catálogo
// (nunca el id externo) más lo mínimo para pintar el ítem elegido.
export type PickedItem = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
};

const ALL_TYPES: ItemType[] = ["book", "movie", "series"];

// Selector de ítem para actividades de club (pool y asistente de proponer).
// Dos fuentes: tu biblioteca (por defecto, lo más probable es que propongas
// algo que ya tienes) y el catálogo general -- busca también en las APIs
// externas para no obligar a añadir el ítem a tu colección antes de usarlo.
// Al elegir un resultado externo se garantiza su uuid local (cache-as-you-go)
// antes de emitir el pick.
export function ItemPicker({
  allowedItemTypes = "all",
  onPick,
  onCancel,
}: {
  allowedItemTypes?: ItemType[] | "all";
  onPick: (item: PickedItem) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("activity");
  const [source, setSource] = useState<"library" | "catalog">("library");
  const [search, setSearch] = useState("");
  // En biblioteca, undefined = sin filtro de tipo (comportamiento original);
  // el catálogo siempre necesita un tipo concreto (searchCatalog es por tipo).
  const [itemType, setItemType] = useState<ItemType | undefined>(
    allowedItemTypes !== "all" ? allowedItemTypes[0] : undefined,
  );
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [catalogResults, setCatalogResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = allowedItemTypes === "all" ? ALL_TYPES : allowedItemTypes;
  const catalogType = itemType ?? types[0];
  const catalogQuery = search.trim();
  const catalogQueryTooShort = source === "catalog" && catalogQuery.length < 2;

  useEffect(() => {
    let cancelled = false;

    if (source === "library") {
      const handle = setTimeout(() => {
        setLoading(true);
        loadMyLibraryItems(search || undefined, itemType).then((results) => {
          if (cancelled) return;
          setLibraryItems(results);
          setLoading(false);
        });
      }, 300);
      return () => {
        cancelled = true;
        clearTimeout(handle);
      };
    }

    // Catálogo: mínimo 2 caracteres -- cada búsqueda puede acabar en una API
    // externa. No hay setState aquí (regla set-state-in-effect): el render
    // oculta los resultados obsoletos vía visibleCatalogResults.
    if (catalogQuery.length < 2) return;
    const handle = setTimeout(() => {
      setLoading(true);
      searchCatalogItems(catalogType, catalogQuery).then((results) => {
        if (cancelled) return;
        setCatalogResults(results);
        setLoading(false);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [source, search, itemType, catalogType, catalogQuery]);

  const visibleCatalogResults = catalogQueryTooShort ? [] : catalogResults;

  function pickLibrary(item: LibraryItem) {
    onPick({
      itemType: item.itemType,
      itemId: item.itemId,
      title: item.title,
      coverUrl: item.coverUrl,
    });
  }

  function pickCatalog(result: SearchResult) {
    setError(null);
    const emit = (itemId: string) =>
      onPick({ itemType: result.itemType, itemId, title: result.title, coverUrl: result.coverUrl });

    // searchCatalogItems ya cachea best-effort; si vino sin catalogId (p.ej.
    // modo mock), se resuelve aquí antes de emitir.
    if (result.catalogId) {
      emit(result.catalogId);
      return;
    }
    setResolving(true);
    resolveCatalogItem(result)
      .then(emit)
      .catch(() => setError(t("pickError")))
      .finally(() => setResolving(false));
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${
      active ? "border-accent text-accent" : "border-border text-muted-foreground hover:text-foreground"
    }`;

  const showTypeChips = source === "catalog" ? types.length > 1 : allowedItemTypes !== "all" && types.length > 1;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface shadow-card p-3">
      <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("pickItem")}
      </span>

      <div className="flex gap-2">
        <button type="button" onClick={() => setSource("library")} className={chip(source === "library")}>
          {t("sourceLibrary")}
        </button>
        <button type="button" onClick={() => setSource("catalog")} className={chip(source === "catalog")}>
          {t("sourceCatalog")}
        </button>
      </div>

      {showTypeChips && (
        <div className="flex gap-2">
          {types.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setItemType(type)}
              className={chip((source === "catalog" ? catalogType : itemType) === type)}
            >
              {t(`itemType_${type}`)}
            </button>
          ))}
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={source === "library" ? t("searchLibraryPlaceholder") : t("searchCatalogPlaceholder")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {error && <p className="text-xs text-status-dropped">{error}</p>}
      {catalogQueryTooShort && <p className="text-xs text-muted-foreground">{t("catalogSearchHint")}</p>}
      {loading && !catalogQueryTooShort && <p className="text-xs text-muted-foreground">…</p>}
      {!loading && !catalogQueryTooShort && source === "library" && libraryItems.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noLibraryItems")}</p>
      )}
      {!loading && !catalogQueryTooShort && source === "catalog" && visibleCatalogResults.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noCatalogResults")}</p>
      )}

      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {source === "library"
          ? libraryItems.map((item) => (
              <button
                key={item.entryId}
                type="button"
                data-testid="item-picker-library-result"
                onClick={() => pickLibrary(item)}
                className="flex items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-surface-muted"
              >
                {item.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que otras tarjetas de catálogo
                  <img src={item.coverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              </button>
            ))
          : visibleCatalogResults.map((result) => {
              const meta = [result.subtitle, result.year].filter(Boolean).join(" · ");
              return (
                <button
                  key={`${result.itemType}:${result.externalId}`}
                  type="button"
                  disabled={resolving}
                  onClick={() => pickCatalog(result)}
                  className="flex items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-surface-muted disabled:opacity-60"
                >
                  {result.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que otras tarjetas de catálogo
                    <img src={result.coverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="min-w-0 truncate">{result.title}</span>
                    {meta && <span className="truncate text-[11px] text-muted-foreground">{meta}</span>}
                  </span>
                </button>
              );
            })}
      </div>

      <button type="button" onClick={onCancel} className="self-start text-xs text-muted-foreground hover:text-foreground">
        {t("cancel")}
      </button>
    </div>
  );
}
