"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import type { ItemType } from "@/lib/catalog/types";
import { loadMyLibraryItems } from "./activity-actions";

// Selector de un ítem de tu biblioteca para añadirlo al pool de una actividad (EPIC-05
// Bloque G) -- mismo patrón onPick/onCancel que ActivitySharePicker (Bloque F), pero
// alimentado por getLibraryItems() en vez de FeedEvents. `allowedItemTypes` (Bloque H1,
// registro de kinds) restringe qué tipos se pueden añadir -- "all" = sin restricción
// (comportamiento original de G); con más de un tipo permitido se muestra un selector.
export function LibraryItemPicker({
  allowedItemTypes = "all",
  onPick,
  onCancel,
}: {
  allowedItemTypes?: ItemType[] | "all";
  onPick: (item: LibraryItem) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("activity");
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<ItemType | undefined>(
    allowedItemTypes !== "all" ? allowedItemTypes[0] : undefined,
  );
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      loadMyLibraryItems(search || undefined, itemType).then((results) => {
        setItems(results);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, itemType]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <span className="text-sm font-medium text-foreground">{t("pickItem")}</span>
      {allowedItemTypes !== "all" && allowedItemTypes.length > 1 && (
        <div className="flex gap-2">
          {allowedItemTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setItemType(type)}
              className={`rounded-full border px-3 py-1 text-xs ${
                itemType === type
                  ? "border-accent text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
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
        placeholder={t("searchLibraryPlaceholder")}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {loading && <p className="text-xs text-muted-foreground">…</p>}
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noLibraryItems")}</p>
      )}
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.entryId}
            type="button"
            onClick={() => onPick(item)}
            className="flex items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-surface-muted"
          >
            {item.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que otras tarjetas de catálogo
              <img src={item.coverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="self-start text-xs text-muted-foreground hover:text-foreground">
        {t("cancel")}
      </button>
    </div>
  );
}
