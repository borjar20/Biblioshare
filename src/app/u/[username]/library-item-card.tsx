"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { LibraryItem, MediaStatus } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getProgress } from "@/lib/library/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { updateStatus, removeFromLibrary } from "./actions";
import { DiaryPanel } from "./diary-panel";
import { ProgressPanel } from "./progress-panel";

const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

export function LibraryItemCard({
  item,
  isOwner,
}: {
  item: LibraryItem;
  isOwner: boolean;
}) {
  const t = useTranslations("library");
  const [isPending, startTransition] = useTransition();
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
          {!isOwner && (
            <div className="absolute right-1.5 top-1.5">
              <StatusBadge status={item.status} label={t(`status.${item.status}`)} />
            </div>
          )}
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
      </div>

      {isOwner && (
        <>
          <select
            value={item.status}
            disabled={isPending}
            onChange={(event) => {
              const status = event.target.value as MediaStatus;
              startTransition(() => updateStatus(item.entryId, status));
            }}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-60"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => removeFromLibrary(item.entryId))}
            className="text-xs text-muted-foreground underline hover:text-status-dropped disabled:opacity-60"
          >
            {t("remove")}
          </button>

          <ProgressPanel item={item} />
          <DiaryPanel libraryEntryId={item.entryId} />
        </>
      )}
    </div>
  );
}
