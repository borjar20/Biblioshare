"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addActivityItem, removeActivityItem, type ActivityItem } from "@/lib/clubs/activities/core";
import { LibraryItemPicker } from "./library-item-picker";
import { itemHref } from "@/lib/catalog/item-href";
import { Button } from "@/components/ui/button";

export function ActivityItemPool({
  activityId,
  items,
  viewerId,
  isParticipant,
  canModerate,
  onChanged,
}: {
  activityId: string;
  items: ActivityItem[];
  viewerId: string;
  isParticipant: boolean;
  canModerate: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("activity");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      <h2 className="text-sm font-semibold text-foreground">{t("itemPool")}</h2>

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
            {(item.addedBy === viewerId || canModerate) && (
              <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleRemove(item.id)}>
                {t("removeItem")}
              </Button>
            )}
          </div>
        ))}
      </div>

      {isParticipant &&
        (picking ? (
          <LibraryItemPicker
            onPick={(libraryItem) => {
              setError(null);
              startTransition(async () => {
                try {
                  await addActivityItem(activityId, libraryItem.itemType, libraryItem.itemId);
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
    </div>
  );
}
