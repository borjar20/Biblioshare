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
// Tamaño FLUIDO: la portada ocupa la columna que le da el grid de la fila
// (`auto-fill` + `1fr`) y guarda la proporción 2:3. Antes medía un ancho fijo y
// el sobrante de cada línea se quedaba como hueco muerto a la derecha; ahora las
// que caben se reparten el ancho exacto. La retícula NO tiene que servir para
// reconocer una obra -- de eso se encarga la hoja --, así que prioriza que
// quepan varias por línea y que no sobre ni un píxel.
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
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-[5px] border bg-surface-muted shadow-cover ${
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
          // Ancho aproximado de una columna del grid en cada tamaño: el grid
          // no da un número fijo, así que se pide el del caso más grande.
          sizes="(min-width: 1024px) 72px, 20vw"
          className="object-cover"
        />
      )}
    </button>
  );
}
