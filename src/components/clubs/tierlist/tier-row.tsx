"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import { TierlistItem } from "./tierlist-item";

// Una fila del tablero (mockup Paper · Clubes, frame de tierlist): contenedor
// único con la etiqueta del tier como columna de color a la izquierda y sus
// portadas a la derecha. `id` es el tier ("S") o "unplaced" para la bandeja --
// es lo que dnd-kit devuelve en `over`. La bandeja usa variant="pool": caja
// punteada sin columna de etiqueta (su rótulo es un eyebrow del tablero).
export function TierRow({
  id,
  label,
  color,
  items,
  editable,
  selectedKey,
  onSelect,
  variant = "tier",
}: {
  id: string;
  label: string;
  /** Color del nivel. null = neutro. */
  color?: string | null;
  items: ActivityItem[];
  editable: boolean;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  variant?: "tier" | "pool";
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const covers = items.map((item) => (
    <TierlistItem
      key={`${item.itemType}:${item.itemId}`}
      item={item}
      editable={editable}
      selected={selectedKey === `${item.itemType}:${item.itemId}`}
      onSelect={() => onSelect(`${item.itemType}:${item.itemId}`)}
    />
  ));

  if (variant === "pool") {
    return (
      <div
        ref={setNodeRef}
        className={`flex min-h-[60px] flex-wrap items-center gap-1.5 rounded-[10px] border border-dashed p-2 ${
          isOver ? "border-accent bg-accent/5" : "border-border bg-surface-muted"
        }`}
      >
        {covers}
      </div>
    );
  }

  return (
    <div
      className={`flex overflow-hidden rounded-[10px] border bg-surface ${
        isOver ? "border-accent" : "border-border"
      }`}
    >
      <div
        className="flex w-11 shrink-0 items-center justify-center self-stretch font-serif text-xl font-bold"
        style={color ? { background: color, color: "var(--tier-foreground)" } : undefined}
      >
        <span className={color ? "" : "text-foreground"}>{label}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[60px] flex-1 flex-wrap items-center gap-1.5 p-2 ${
          isOver ? "bg-accent/5" : ""
        }`}
      >
        {covers}
      </div>
    </div>
  );
}
