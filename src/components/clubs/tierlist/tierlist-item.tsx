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
//
// Tamaño: 44×66. A las 34×51 originales no se distinguía una portada de otra,
// y la retícula sigue cabiendo a 4 por línea a 360px. Para verla de verdad, la
// portada CRECE (×1.6, ~70×105) cuando está seleccionada -- o al pasar por
// encima si el tablero es ajeno y no hay selección que hacer. Dos detalles que
// hay que respetar si se toca esto:
//
//   - Crece con la propiedad nativa `scale`, no con `transform`: dnd-kit escribe
//     `transform` en el `style` en línea durante el arrastre y machacaría
//     cualquier escala puesta ahí. Con `scale` aparte, ambas cosas conviven.
//   - Crece POR ENCIMA de su caja (z-20), así que ninguna fila del tablero puede
//     llevar `overflow-hidden` -- ver la nota de tier-row.tsx.
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
  const className = `relative h-[66px] w-[44px] shrink-0 overflow-hidden rounded-[5px] border bg-surface-muted shadow-cover transition-[scale] duration-150 ${
    selected ? "z-20 scale-[1.6] border-accent ring-1 ring-accent" : "border-border"
  } ${isDragging ? "opacity-60" : ""} ${
    // `touch-manipulation`, no `touch-none` (#723): `none` le quita al
    // navegador el gesto ANTES de que el TouchSensor decida si esto era un
    // arrastre o un scroll, y con la bandeja llena de portadas no se podía
    // bajar la página con el pulgar. El sensor hace `preventDefault` por su
    // cuenta cuando el arrastre llega a activarse.
    editable ? "cursor-grab touch-manipulation active:cursor-grabbing" : "cursor-default"
  }`;
  const cover = item.itemCoverUrl && (
    <Image
      src={item.itemCoverUrl}
      alt={item.itemTitle}
      fill
      // El ancho de la portada AMPLIADA (44 × 1.6 ≈ 70): pedir 44px dejaría la
      // ampliación borrosa, que es justo para lo que existe.
      sizes="72px"
      className="object-cover"
    />
  );

  // Tablero ajeno (solo lectura): sin arrastre ni selección de tier que
  // proteger, así que la portada es directamente el enlace a la ficha -- ya
  // no hay lista de ítems debajo del detalle que ofrezca esa vía.
  if (!editable) {
    return (
      <Link
        href={itemHref(item.itemType, item.itemId)}
        title={item.itemTitle}
        className={`${className} hover:z-20 hover:scale-[1.6] focus-visible:z-20 focus-visible:scale-[1.6]`}
      >
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
