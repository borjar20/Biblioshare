"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import type { TierColumn } from "@/lib/clubs/activities/tierlist-types";
import { TierlistItem } from "./tierlist-item";

// Una fila del tablero (mockup Paper · Clubes, frame de tierlist): contenedor
// único con la etiqueta del tier como columna de color a la izquierda y sus
// portadas a la derecha. `id` es el tier ("S") o "unplaced" para la bandeja --
// es lo que dnd-kit devuelve en `over`. La bandeja usa variant="pool": caja
// punteada sin columna de etiqueta (su rótulo es un eyebrow del tablero).
//
// La columna tiene DOS anchos (`column`, decidido para todo el tablero en
// `tierColumnWidth`):
//
//   - "narrow" (44px, serif a 20px) para el S/A/B/C/D del mockup.
//   - "wide" (84px, rótulo mono pequeño y envuelto) para niveles con nombre
//     ("Perezón histórico"). Antes esos nombres se pintaban en los 44px fijos
//     y el `overflow-hidden` de la fila los cortaba a media palabra.
//
// Las filas NO recortan a sus hijos: el redondeado de la columna se declara en
// el propio hijo (`rounded-l-[9px]`) en vez de heredarse de un `overflow-hidden`
// del contenedor. Ese `overflow-hidden` era justo lo que cortaba la etiqueta, y
// además la columna tiene que poder EMPUJAR el alto de la fila cuando el rótulo
// necesita cuatro líneas.
//
// Las portadas van en un GRID de columnas fluidas, no en un `flex-wrap`: con el
// flex sobraba un hueco al final de cada línea (las portadas medían un ancho
// fijo y el resto del ancho no se repartía). Con `auto-fill` + `1fr` caben las
// que quepan a >=48px y se reparten el ancho exacto, sin hueco.
export function TierRow({
  id,
  label,
  color,
  items,
  editable,
  selectedKey,
  onSelect,
  variant = "tier",
  column = "narrow",
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
  column?: TierColumn;
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

  // `min-h` con el alto de una portada a 48px (el mínimo del grid) más el
  // padding: sin él, un tier vacío se queda más bajo que el resto y no se ve
  // como sitio donde soltar.
  const dropArea =
    "grid grid-cols-[repeat(auto-fill,minmax(48px,1fr))] content-center items-center gap-1.5 p-2 min-h-[88px]";

  if (variant === "pool") {
    return (
      <div
        ref={setNodeRef}
        className={`relative ${dropArea} rounded-[10px] border border-dashed ${
          isOver ? "border-accent bg-accent/5" : "border-border bg-surface-muted"
        }`}
      >
        {covers}
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
        className={`flex shrink-0 items-center justify-center self-stretch rounded-l-[9px] text-center ${
          column === "wide"
            ? "w-[84px] px-1.5 py-1.5 font-mono text-[10px] leading-[1.2] font-medium tracking-[0.06em] break-words uppercase"
            : "w-11 px-1 font-serif text-xl font-bold"
        } ${color ? "" : "text-foreground"}`}
        style={color ? { background: color, color: "var(--tier-foreground)" } : undefined}
      >
        {/* Un rótulo de cuatro líneas puede dejar huérfano el último trozo (el
            ")" de "…los entendidos)"). `text-wrap: balance` NO lo arregla aquí
            -- probado: la caja es un flex container y el reparto no llega al
            texto del <span>. Se deja así: se lee, que es lo que se pedía. */}
        <span className="min-w-0">{label}</span>
      </div>
      <div ref={setNodeRef} className={`${dropArea} flex-1 ${isOver ? "bg-accent/5" : ""}`}>
        {covers}
      </div>
    </div>
  );
}
