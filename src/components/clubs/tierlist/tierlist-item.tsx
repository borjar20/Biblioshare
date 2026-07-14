"use client";

import Image from "next/image";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ActivityItem } from "@/lib/clubs/activities/core";

// Una portada dentro del tablero. Arrastrable solo si el tablero es el del viewer (las
// tierlists ajenas son de solo lectura).
//
// Los botones de tier NO viven aquí sino en el tablero, para no repetir N botones bajo cada
// portada: en móvil se toca la portada (que queda marcada) y se elige el tier abajo. Aquí solo
// el arrastre y la selección.
export function TierlistItem({
  item,
  editable,
  selected,
  onSelect,
}: {
  item: ActivityItem;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const id = `${item.itemType}:${item.itemId}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: !editable,
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...(editable ? attributes : {})}
      {...(editable ? listeners : {})}
      onClick={editable ? onSelect : undefined}
      aria-pressed={selected}
      title={item.itemTitle}
      className={`relative h-[51px] w-[34px] shrink-0 overflow-hidden rounded-[4px] border bg-surface-muted shadow-cover ${
        selected ? "border-accent ring-1 ring-accent" : "border-border"
      } ${isDragging ? "opacity-60" : ""} ${
        editable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-default"
      }`}
    >
      {item.itemCoverUrl && (
        <Image
          src={item.itemCoverUrl}
          alt={item.itemTitle}
          fill
          sizes="34px"
          className="object-cover"
        />
      )}
    </button>
  );
}
