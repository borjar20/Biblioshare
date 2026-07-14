"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addActivityItem, removeActivityItem, type ActivityItem } from "@/lib/clubs/activities/core";
import { ItemPicker } from "./item-picker";
import { itemHref } from "@/lib/catalog/item-href";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";

export function ActivityItemPool({
  activityId,
  items,
  viewerId,
  isParticipant,
  isCreator,
  canModerate,
  allowedItemTypes,
  maxItems,
  itemCuration,
  onChanged,
}: {
  activityId: string;
  items: ActivityItem[];
  viewerId: string;
  isParticipant: boolean;
  isCreator: boolean;
  canModerate: boolean;
  // Restricción por kind (registro de EPIC-05 Bloque H1) -- "all"/null = sin
  // restricción, comportamiento original de Bloque G.
  allowedItemTypes: ItemType[] | "all";
  maxItems: number | null;
  // Quién cura el pool (EPIC-05 Bloque H3). Espejo en UI de la política RLS
  // "club_activity_items insert participant or curator" -- la RLS sigue siendo
  // la autoridad, esto solo evita ofrecer un botón que fallaría.
  itemCuration: "participants" | "curators";
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCurate =
    itemCuration === "curators" ? isCreator || canModerate : isParticipant;

  function handleRemove(itemId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeActivityItem(itemId);
        onChanged();
      } catch {
        setError(t("itemPoolError"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("itemPool")}
      </h2>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
            <Link
              href={itemHref(item.itemType, item.itemId)}
              className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:text-accent"
            >
              {item.itemCoverUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
                <img src={item.itemCoverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.itemTitle}</span>
            </Link>
            {/* Espejo de la política DELETE: quien lo añadió, moderator+, o el
                creador cuando el kind es de curadores (su propia lista). */}
            {(item.addedBy === viewerId ||
              canModerate ||
              (itemCuration === "curators" && isCreator)) && (
              <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleRemove(item.id)}>
                {t("removeItem")}
              </Button>
            )}
          </div>
        ))}
      </div>

      {canCurate &&
        (maxItems == null || items.length < maxItems) &&
        (picking ? (
          <ItemPicker
            allowedItemTypes={allowedItemTypes}
            onPick={(picked) => {
              setError(null);
              startTransition(async () => {
                try {
                  await addActivityItem(activityId, picked.itemType, picked.itemId);
                  setPicking(false);
                  onChanged();
                } catch {
                  setError(t("itemPoolError"));
                }
              });
            }}
            onCancel={() => setPicking(false)}
          />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
            {t("addItem")}
          </Button>
        ))}

      {/* Sin esto, un participante de un reto por lista no entendería por qué
          no puede tocar la lista. */}
      {itemCuration === "curators" && !canCurate && (
        <p className="text-xs text-muted-foreground">{t("listChallengeCuratorsOnly")}</p>
      )}
    </div>
  );
}
