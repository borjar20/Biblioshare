"use client";

import Image from "next/image";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { LibraryItem, MediaStatus } from "@/lib/library/types";
import { updateStatus, removeFromLibrary } from "./actions";
import { DiaryPanel } from "./diary-panel";
import { ProgressPanel } from "./progress-panel";

const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

export function LibraryItemCard({ item }: { item: LibraryItem }) {
  const t = useTranslations("library");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface-muted">
        {item.coverUrl ? (
          <Image
            src={item.coverUrl}
            alt={item.title}
            fill
            sizes="(max-width: 768px) 45vw, 200px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
            {item.title}
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <span className="line-clamp-2 text-sm font-medium text-foreground">
          {item.title}
        </span>
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
      </div>

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
    </div>
  );
}
