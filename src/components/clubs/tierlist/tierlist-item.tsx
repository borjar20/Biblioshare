"use client";

import Image from "next/image";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ActivityItem } from "@/lib/clubs/activities/core";

// Una portada dentro del tablero. Arrastrable solo si el tablero es el del
// viewer (las tierlists ajenas son de solo lectura), pero SIEMPRE pulsable: en
// los dos casos abre la hoja del ítem (`tierlist-item-sheet.tsx`), que es donde
// se ve la portada grande, el título y -- si el tablero es tuyo -- los botones
// de tier.
//
// Los botones de tier NO viven aquí: repetir N botones bajo cada portada llenaba
// el tablero de controles. Antes vivían en una fila al pie del tablero, lo que
// obligaba a mirar arriba (qué seleccioné) y tocar abajo (dónde va); ahora van
// en la hoja, junto a la portada que se está colocando.
//
// Tamaño: 56×84. La retícula NO tiene que servir para reconocer una obra -- de
// eso se encarga la hoja --, así que se queda en miniatura y prioriza que
// quepan varias por línea (cinco a 360px). Las 34×51 originales eran otra cosa:
// ahí no se distinguía ni el color de la portada.
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
      {...attributes}
      {...listeners}
      onClick={onSelect}
      aria-haspopup="dialog"
      aria-expanded={selected}
      title={item.itemTitle}
      data-testid="tierlist-cover"
      className={`relative h-[84px] w-[56px] shrink-0 overflow-hidden rounded-[5px] border bg-surface-muted shadow-cover ${
        selected ? "border-accent ring-1 ring-accent" : "border-border"
      } ${isDragging ? "opacity-60" : ""} ${
        // `touch-manipulation`, no `touch-none` (#723): `none` le quita al
        // navegador el gesto ANTES de que el TouchSensor decida si esto era un
        // arrastre o un scroll, y con la bandeja llena de portadas no se podía
        // bajar la página con el pulgar. El sensor hace `preventDefault` por su
        // cuenta cuando el arrastre llega a activarse.
        editable ? "cursor-grab touch-manipulation active:cursor-grabbing" : "cursor-pointer"
      }`}
    >
      {item.itemCoverUrl && (
        <Image
          src={item.itemCoverUrl}
          alt={item.itemTitle}
          fill
          sizes="56px"
          className="object-cover"
        />
      )}
    </button>
  );
}
