"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CollectionCard as CollectionCardData } from "@/lib/library/collections";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { CollectionMenu } from "./collection-menu";

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
  const router = useRouter();
  const covers = card.fanCovers.slice(0, 3);
  const isEmpty = covers.length === 0;
  const fanSlots = isEmpty ? [null, null, null] : covers;
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
    // El menú «⋯» (atajos de renombrar/sorteo/borrar) va FUERA del <Link>, como
    // superficie propia. Un <button> anidado dentro de un <a> es HTML inválido
    // (contenido interactivo dentro de contenido interactivo) y además el clic
    // se propagaría al enlace y navegaría al detalle en vez de abrir el menú.
    // Mismo patrón que `LibraryItemCard`: el `<Link>` cubre el contenido de la
    // tarjeta, el menú es un hermano posicionado encima en la esquina.
    <div className="group relative flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent">
      <Link href={`/coleccion/c/${card.id}`} className="flex flex-col gap-3">
        {/* Una colección sin ítems dibujaba 168px de BLANCO (F3-015): el
            `covers.map` no tenía sobre qué iterar y la tarjeta parecía a medio
            cargar, no vacía. Ahora el abanico se pinta igual con tres huecos
            punteados — misma geometría, mismo gesto al pasar el ratón — y una
            línea que dice qué pasa. Los huecos son decorativos: lo que un
            lector de pantalla necesita ya lo dice el «0 títulos» de abajo. */}
        <div className="relative isolate h-[112px] w-full sm:h-[150px] lg:h-[168px]">
          {fanSlots.map((cover, index) => {
            const slot = FAN_SLOTS[index];
            return (
              <div
                key={index}
                aria-hidden={isEmpty || undefined}
                className={`absolute top-1/2 left-1/2 -translate-y-1/2 overflow-hidden rounded-[5px] border bg-surface-muted shadow-cover transition-transform duration-200 ${COVER_SIZE} ${slot.x} ${slot.rotate} ${slot.hover} ${FAN_Z[index]} ${
                  isEmpty ? "border-dashed border-border/70 bg-surface-muted/50 shadow-none" : "border-border"
                }`}
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
          {isEmpty && (
            <span className="absolute inset-x-0 bottom-0 z-40 text-center font-mono text-[10px] text-muted-foreground">
              {t("cardEmptyHint")}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1 pr-8">
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

      <div className="absolute top-3 right-3 z-40">
        <CollectionMenu
          collectionId={card.id}
          name={card.name}
          description={card.description}
          isSorteable={card.isSorteable}
          triggerClassName="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-lg border border-border bg-surface/90 text-muted-foreground shadow-card backdrop-blur transition-colors hover:bg-surface-muted hover:text-foreground"
          // Ya estamos en /coleccion?tab=colecciones: `router.refresh()` vuelve
          // a pedir la rejilla (la tarjeta borrada desaparece en su sitio) en
          // vez del push a /coleccion por defecto de CollectionMenu, que en el
          // detalle tiene sentido (la colección ya no existe) pero aquí solo
          // sacaría a la persona de la pestaña Colecciones a la de Todo.
          onDeleted={() => router.refresh()}
        />
      </div>
    </div>
  );
}
