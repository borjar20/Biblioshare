"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getProgress } from "@/lib/library/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { toggleFavorite } from "./actions";

export function LibraryItemCard({
  item,
  isOwner,
}: {
  item: LibraryItem;
  isOwner: boolean;
}) {
  const t = useTranslations("library");
  const [isPending, startTransition] = useTransition();
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const progress = getProgress(item);

  return (
    <div className="flex flex-col gap-2">
      <Link href={itemHref(item.itemType, item.itemId)} className="group flex flex-col gap-2">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-border bg-surface-muted">
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 45vw, 200px"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
              {item.title}
            </div>
          )}
          <div className="absolute right-1.5 top-1.5">
            <StatusBadge status={item.status} label={t(`status.${item.status}`)} />
          </div>
        </div>

        <span className="line-clamp-2 text-sm font-medium text-foreground">
          {item.title}
        </span>
      </Link>

      <div className="flex flex-col gap-1">
        {item.subtitle && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {item.subtitle}
          </span>
        )}
        {(item.publisher || item.pageCount) && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {[item.publisher, item.pageCount ? `${item.pageCount} págs.` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        {progress && <ProgressBar current={progress.current} total={progress.total} label={progress.label} />}
        {item.rereadCount > 0 && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {t(`rereadCount.${item.itemType}`, { count: item.rereadCount })}
          </span>
        )}
      </div>

      {isOwner && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setFavoriteError(null);
                const result = await toggleFavorite(item.entryId);
                if (result.error) setFavoriteError(t(`pinError`));
              })
            }
            className="text-left text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-60"
          >
            {item.pinnedOrder !== null ? t("unpin") : t("pin")}
          </button>
          {favoriteError && (
            <p className="text-xs text-status-dropped">{favoriteError}</p>
          )}
        </>
      )}
    </div>
  );
}
