"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import type { TierRowLayout } from "@/lib/clubs/activities/tierlist-types";
import { TierlistItem } from "./tierlist-item";

// Una fila del tablero (mockup Paper · Clubes, frame de tierlist). Dos formas:
//
//   - "column": contenedor único con la etiqueta del tier como columna de color
//     a la izquierda y sus portadas a la derecha. Es el dibujo del mockup y
//     solo vale para etiquetas cortas (S, A, B...).
//   - "banner": la etiqueta ocupa una banda de color a lo ancho y las portadas
//     van debajo. Para tierlists con niveles con nombre ("Perezón histórico").
//
// `id` es el tier ("S") o "unplaced" para la bandeja -- es lo que dnd-kit
// devuelve en `over`. La bandeja usa variant="pool": caja punteada sin etiqueta
// (su rótulo es un eyebrow del tablero).
//
// Las filas NO recortan a sus hijos: el redondeado de la columna/banda de color
// se declara en el propio hijo (`rounded-l-[9px]` / `rounded-t-[9px]`) en vez de
// heredarse de un `overflow-hidden` del contenedor. Ese `overflow-hidden` era
// justo lo que cortaba la etiqueta larga a media palabra, así que aquí no vuelve.
export function TierRow({
  id,
  label,
  color,
  items,
  editable,
  selectedKey,
  onSelect,
  variant = "tier",
  layout = "column",
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
  layout?: TierRowLayout;
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

  // Alto mínimo = portada (84px) + padding vertical (2 × 8px). Sin él, un tier
  // vacío se queda más bajo que el resto y no se ve como sitio donde soltar.
  const dropAreaBase = "flex min-h-[100px] flex-wrap items-center gap-1.5 p-2";

  if (variant === "pool") {
    return (
      <div
        ref={setNodeRef}
        className={`relative ${dropAreaBase} rounded-[10px] border border-dashed ${
          isOver ? "border-accent bg-accent/5" : "border-border bg-surface-muted"
        }`}
      >
        {covers}
      </div>
    );
  }

  const colorStyle = color
    ? { background: color, color: "var(--tier-foreground)" }
    : undefined;

  if (layout === "banner") {
    return (
      <div
        className={`relative flex flex-col rounded-[10px] border bg-surface ${
          isOver ? "border-accent" : "border-border"
        }`}
      >
        <div
          className={`rounded-t-[9px] px-3 py-1.5 font-serif text-[15px] leading-tight font-bold break-words ${
            color ? "" : "bg-surface-muted text-foreground"
          }`}
          style={colorStyle}
        >
          {label}
        </div>
        <div
          ref={setNodeRef}
          className={`${dropAreaBase} ${isOver ? "bg-accent/5" : ""}`}
        >
          {covers}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex rounded-[10px] border bg-surface ${
        isOver ? "border-accent" : "border-border"
      }`}
    >
      <div
        className={`flex w-11 shrink-0 items-center justify-center self-stretch overflow-hidden rounded-l-[9px] px-1 text-center font-serif font-bold ${
          label.length > 2 ? "text-base" : "text-xl"
        } ${color ? "" : "text-foreground"}`}
        style={colorStyle}
      >
        <span>{label}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`${dropAreaBase} flex-1 ${isOver ? "bg-accent/5" : ""}`}
      >
        {covers}
      </div>
    </div>
  );
}
