"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import { TierlistItem } from "./tierlist-item";

// Una fila del tablero: la etiqueta del tier a la izquierda y sus portadas a la derecha.
// `id` es el tier ("S") o "unplaced" para la bandeja -- es lo que dnd-kit devuelve en `over`.
export function TierRow({
  id,
  label,
  items,
  editable,
  selectedKey,
  onSelect,
}: {
  id: string;
  label: string;
  items: ActivityItem[];
  editable: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-sm font-semibold text-foreground">
        {label}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[4.5rem] flex-1 flex-wrap items-center gap-2 rounded-md border p-2 ${
          isOver ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        {items.map((item) => (
          <TierlistItem
            key={`${item.itemType}:${item.itemId}`}
            item={item}
            editable={editable}
            selected={selectedKey === `${item.itemType}:${item.itemId}`}
            onSelect={() => onSelect(`${item.itemType}:${item.itemId}`)}
          />
        ))}
      </div>
    </div>
  );
}
