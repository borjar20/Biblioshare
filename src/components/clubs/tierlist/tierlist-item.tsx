"use client";

import Image from "next/image";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import { itemHref } from "@/lib/catalog/item-href";

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
  const className = `relative h-[51px] w-[34px] shrink-0 overflow-hidden rounded-[4px] border bg-surface-muted shadow-cover ${
    selected ? "border-accent ring-1 ring-accent" : "border-border"
  } ${isDragging ? "opacity-60" : ""} ${
    editable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-default"
  }`;
  const cover = item.itemCoverUrl && (
    <Image
      src={item.itemCoverUrl}
      alt={item.itemTitle}
      fill
      sizes="34px"
      className="object-cover"
    />
  );

  // Tablero ajeno (solo lectura): sin arrastre ni selección de tier que
  // proteger, así que la portada es directamente el enlace a la ficha -- ya
  // no hay lista de ítems debajo del detalle que ofrezca esa vía.
  if (!editable) {
    return (
      <Link href={itemHref(item.itemType, item.itemId)} title={item.itemTitle} className={className}>
        {cover}
      </Link>
    );
  }

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      aria-pressed={selected}
      title={item.itemTitle}
      className={className}
    >
      {cover}
    </button>
  );
}
