"use client";

import Image from "next/image";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import type { ItemEstimate, QueueItem } from "@/lib/queue/types";
import { itemHref } from "@/lib/catalog/item-href";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { GripVerticalIcon } from "@/components/ui/icons";

export function QueueItemRow({
  item,
  estimate,
}: {
  item: QueueItem;
  estimate: ItemEstimate | undefined;
}) {
  const t = useTranslations("queue");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.entryId,
  });
  const accent = MEDIA_ACCENT[item.itemType];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border ${accent.borderSoft} bg-surface p-2 ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("dragHandle")}
        className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVerticalIcon className="h-5 w-5" />
      </button>

      <div
        className={`relative h-16 w-11 shrink-0 overflow-hidden rounded border ${accent.borderSoft} bg-surface-muted`}
      >
        {item.coverUrl && (
          <Image
            src={item.coverUrl}
            alt={item.title}
            fill
            sizes="44px"
            className="object-cover"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={itemHref(item.itemType, item.itemId)}
          className="truncate text-sm font-medium text-foreground hover:underline"
        >
          {item.title}
        </Link>
        {item.subtitle && (
          <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
        )}
        {estimate && (
          <span className="truncate text-xs text-muted-foreground">{estimate.formulaText}</span>
        )}
      </div>
    </li>
  );
}
