"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CollectionCard as CollectionCardData } from "@/lib/library/collections";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

// Componente de CLIENTE, no de servidor: quien lo pinta es `CollectionsBrowser`,
// que filtra y ordena en el navegador y no puede renderizar un componente async.
// Las traducciones salen de `useTranslations`, que funciona porque
// `/coleccion/layout.tsx` ya monta el provider con el namespace `collection`.

// Posición de cada portada en el abanico (mockup `.fan`/`.colc`): la más
// reciente (`fanCovers[0]`) va centrada y encima; las otras dos se abren en
// abanico a los lados, detrás. Cada slot centra la portada en el contenedor
// (`left-1/2 top-1/2` + `-translate-y-1/2`) y desplaza en X *antes* de
// rotar — Tailwind compone siempre `translate(...) rotate(...)` en ese
// orden, así el desplazamiento ocurre en el eje de pantalla y la rotación
// gira la portada ya desplazada sobre su propio centro (no al revés, que
// daría un desplazamiento diagonal).
//
// El desplazamiento crece con el ancho (24 → 32 → 36px) junto al tamaño de la
// portada: con el offset fijo del diseño original (22px), una portada de 93px
// tapaba casi entera a sus vecinas y el abanico dejaba de leerse como tal. Al
// pasar el ratón se abre otros 4px, que es de donde sale la sensación de que la
// tarjeta "responde" sin tener que animar nada más.
//
// Los literales van completos a propósito: Tailwind escanea el fuente en busca
// de nombres de clase enteros, así que una cadena compuesta en tiempo de
// ejecución no genera CSS.
const FAN_SLOTS = [
  { x: "-translate-x-1/2", rotate: "", hover: "group-hover:-translate-y-1" },
  {
    x: "translate-x-[calc(-50%-24px)] sm:translate-x-[calc(-50%-32px)] lg:translate-x-[calc(-50%-36px)]",
    rotate: "-rotate-[14deg]",
    hover:
      "group-hover:translate-x-[calc(-50%-28px)] sm:group-hover:translate-x-[calc(-50%-36px)] lg:group-hover:translate-x-[calc(-50%-40px)]",
  },
  {
    x: "translate-x-[calc(-50%+24px)] sm:translate-x-[calc(-50%+32px)] lg:translate-x-[calc(-50%+36px)]",
    rotate: "rotate-[14deg]",
    hover:
      "group-hover:translate-x-[calc(-50%+28px)] sm:group-hover:translate-x-[calc(-50%+36px)] lg:group-hover:translate-x-[calc(-50%+40px)]",
  },
];
const FAN_Z = ["z-30", "z-20", "z-10"];

const COVER_SIZE =
  "h-[92px] w-[61px] sm:h-[124px] sm:w-[83px] lg:h-[140px] lg:w-[93px]";

// Orden fijo (no por frecuencia): que la línea diga siempre «libros · películas
// · series» hace comparables dos tarjetas de un vistazo.
const BREAKDOWN_ORDER: ItemType[] = ["book", "movie", "series"];

export function CollectionCard({ card }: { card: CollectionCardData }) {
  const t = useTranslations("collection");
  const covers = card.fanCovers.slice(0, 3);
  const dotClass = card.dominantType
    ? MEDIA_ACCENT[card.dominantType].bg
    : "bg-muted-foreground";

  // Con un solo tipo, el desglose repetiría el total («15 títulos · 15 libros»):
  // en ese caso no se pinta nada.
  const present = BREAKDOWN_ORDER.filter((type) => (card.typeCounts[type] ?? 0) > 0);
  const breakdown =
    present.length > 1
      ? present
          .map((type) => t(`typeCount.${type}`, { count: card.typeCounts[type]! }))
          .join(" · ")
      : null;

  return (
    <Link
      href={`/coleccion/c/${card.id}`}
      className="group flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent"
    >
      <div className="relative isolate h-[112px] w-full sm:h-[150px] lg:h-[168px]">
        {covers.map((cover, index) => {
          const slot = FAN_SLOTS[index];
          return (
            <div
              key={index}
              className={`absolute top-1/2 left-1/2 -translate-y-1/2 overflow-hidden rounded-[5px] border border-border bg-surface-muted shadow-cover transition-transform duration-200 ${COVER_SIZE} ${slot.x} ${slot.rotate} ${slot.hover} ${FAN_Z[index]}`}
            >
              {cover && (
                <Image
                  src={cover}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 61px, (max-width: 1024px) 83px, 93px"
                  className="object-cover"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <span className="line-clamp-1 font-serif text-base font-semibold text-foreground">
          {card.name}
        </span>

        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
          {t("titleCount", { count: card.count })}
        </span>

        {breakdown && (
          <span className="line-clamp-1 font-mono text-[11px] text-muted-foreground">
            {breakdown}
          </span>
        )}
      </div>
    </Link>
  );
}
