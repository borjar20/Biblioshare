"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { Position } from "@/lib/library/position";
import type { ProgressSession } from "@/lib/sessions/types";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";
import { updateStatus, removeFromLibrary } from "@/lib/library/manage-actions";
import { ProgressPanel } from "./progress-panel";
import { DiaryPanel } from "./diary-panel";
import { SessionList } from "./session-list";

const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

export type ManagedEntry = {
  entryId: string;
  status: MediaStatus;
  rating: number | null;
  position: Position;
  notes: string | null;
};

export function ItemManagePanel({
  itemType,
  itemId,
  entry,
  sessions,
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry | null;
  sessions: ProgressSession[];
}) {
  const t = useTranslations("item");
  const [isPending, startTransition] = useTransition();

  if (!entry) {
    return (
      <Button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => addExistingItemToLibrary(itemType, itemId))
        }
      >
        {isPending ? t("following") : t("follow")}
      </Button>
    );
  }

  return (
    <ManagedControls
      itemType={itemType}
      itemId={itemId}
      entry={entry}
      sessions={sessions}
    />
  );
}

function ManagedControls({
  itemType,
  itemId,
  entry,
  sessions,
}: {
  itemType: ItemType;
  itemId: string;
  entry: ManagedEntry;
  sessions: ProgressSession[];
}) {
  const t = useTranslations("item");
  const tLibrary = useTranslations("library");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(entry.status);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`manage-status-${entry.entryId}`}
          className="text-sm font-medium"
        >
          {t("status")}
        </label>
        <select
          id={`manage-status-${entry.entryId}`}
          value={status}
          disabled={isPending}
          onChange={(event) => {
            const next = event.target.value as MediaStatus;
            setStatus(next);
            startTransition(() => updateStatus(entry.entryId, itemType, itemId, next));
          }}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-60"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tLibrary(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <ProgressPanel
        entryId={entry.entryId}
        itemType={itemType}
        itemId={itemId}
        rating={entry.rating}
        position={entry.position}
        notes={entry.notes}
      />

      {itemType !== "movie" && (
        <SessionList
          entryId={entry.entryId}
          itemType={itemType}
          itemId={itemId}
          sessions={sessions}
        />
      )}

      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="text-sm font-medium">{tLibrary("diaryTitle")}</span>
        <DiaryPanel
          libraryEntryId={entry.entryId}
          itemType={itemType}
          itemId={itemId}
        />
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => removeFromLibrary(entry.entryId, itemType, itemId))
        }
        className="self-start text-xs text-muted-foreground underline hover:text-status-dropped disabled:opacity-60"
      >
        {t("unfollow")}
      </button>
    </div>
  );
}
