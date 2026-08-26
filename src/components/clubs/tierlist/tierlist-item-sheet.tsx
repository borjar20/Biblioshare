"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import type { ItemType } from "@/lib/catalog/types";
import type { TierSpec } from "@/lib/clubs/activities/tierlist-types";
import { itemHref } from "@/lib/catalog/item-href";

// La hoja de una portada del tablero. Se abre al tocar una portada y es, a la
// vez, la ÚNICA respuesta a las dos cosas que fallaban en la retícula:
//
//   - "No distingo una portada de otra": aquí la portada se ve grande de verdad
//     (hasta 46vh), con el título y el tipo escritos. La retícula puede
//     quedarse en miniaturas porque ya no tiene que servir para reconocer nada.
//   - "Miro arriba qué seleccioné y toco abajo dónde va": los botones de tier
//     viven DENTRO de la hoja, junto a la portada que se está colocando. Elegir
//     nivel cierra la hoja.
//
// `<dialog>` nativo con `showModal()`, como el resto de capas del repo
// (`sheet-shell.tsx`, `image-zoom.tsx`): trae gratis Escape, la trampa de foco
// y el `inert` del fondo. Reimplementarlo con un div superpuesto sería perder
// las tres cosas -- y aquí el fondo es un tablero lleno de botones arrastrables.
//
// En tableros ajenos (solo lectura) la hoja es la misma pero sin botones: solo
// mirar y, si acaso, saltar a la ficha.

// Mapa explícito y no `t(`itemType_${type}`)`: con las claves interpoladas
// next-intl pierde el tipado y un tipo nuevo se descubre en producción, no en
// `tsc`.
const TYPE_KEY: Record<ItemType, "itemType_book" | "itemType_movie" | "itemType_series"> = {
  book: "itemType_book",
  movie: "itemType_movie",
  series: "itemType_series",
};

export function TierlistItemSheet({
  item,
  tiers,
  currentTier,
  editable,
  onPlace,
  onClose,
}: {
  item: ActivityItem;
  tiers: TierSpec[];
  /** Nivel donde está ahora, o null si sigue en la bandeja. */
  currentTier: string | null;
  editable: boolean;
  /** Mueve el ítem a un tier, o a la bandeja si el destino es `null`. */
  onPlace: (tier: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations("activity");
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const abiertaEn = useRef(pathname);

  useEffect(() => {
    // Idempotente a propósito: en dev, StrictMode invoca este efecto dos veces,
    // y `showModal()` sobre un <dialog> ya abierto lanza `InvalidStateError`.
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  // "Ver ficha" navega con la hoja abierta. Con Cache Components la hoja NO se
  // desmonta en navegación soft: el <dialog> quedaría con `open=true` pero
  // fuera del top layer al volver, roto e incerrable (#448, mismo caso que
  // `item-connect-sheet` y `sheet-shell`). Al cambiar de ruta se cierra.
  //
  // El guardia compara la RUTA en la que se abrió, no un booleano "ya he
  // corrido una vez". Con el booleano, la segunda invocación que hace
  // StrictMode en dev encontraba el guardia ya puesto y cerraba la hoja
  // recién abierta: se seleccionaba la portada y no pasaba nada.
  useEffect(() => {
    if (pathname !== abiertaEn.current) ref.current?.close();
  }, [pathname]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={item.itemTitle}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      // Centrada en pantalla, no pegada abajo: aquí la portada ES el contenido
      // y la hoja ocupa casi todo el alto, así que el gesto de "tirar de la hoja
      // desde el pulgar" no aporta -- y anclarla abajo dejaba un hueco muerto
      // arriba con la portada descentrada respecto al scrim.
      className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-scrim"
    >
      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("tierlistItemSheetClose")}
            className="tap-44 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
          >
            ✕
          </button>
        </div>

        {/* La portada manda en la hoja: el alto se mide en vh para que ocupe lo
            que dé la pantalla sin empujar al título ni a los tiers fuera de
            vista en un móvil bajo. */}
        {item.itemCoverUrl && (
          <div className="relative mx-auto aspect-[2/3] h-[46vh] max-h-[46vh] w-auto overflow-hidden rounded-[8px] border border-border bg-surface-muted shadow-cover">
            <Image
              src={item.itemCoverUrl}
              alt={item.itemTitle}
              fill
              sizes="(min-width: 1024px) 320px, 60vw"
              className="object-cover"
            />
          </div>
        )}

        <div className="flex flex-col gap-1 text-center">
          <span className="label-section">{t(TYPE_KEY[item.itemType])}</span>
          <b className="font-serif text-[18px] leading-tight font-semibold">{item.itemTitle}</b>
          <Link
            href={itemHref(item.itemType, item.itemId)}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("viewItemSheet")}
          </Link>
        </div>

        {editable && (
          <div className="flex flex-col gap-1.5">
            <p className="label-section">{t("tierlistPickTier")}</p>
            <div className="flex flex-wrap gap-1.5">
              {tiers.map((tier) => (
                <button
                  key={tier.label}
                  type="button"
                  // `aria-pressed` en vez de deshabilitar el nivel actual: dice
                  // dónde está el ítem AHORA sin quitarle al lector la única
                  // pista de dónde estaba si se equivoca de nivel.
                  aria-pressed={currentTier === tier.label}
                  onClick={() => onPlace(tier.label)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs ${
                    currentTier === tier.label
                      ? "border-accent text-accent"
                      : "border-border text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {tier.color && (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: tier.color }}
                    />
                  )}
                  {tier.label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={currentTier === null}
                onClick={() => onPlace(null)}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 py-1.5 text-xs ${
                  currentTier === null
                    ? "border-accent text-accent"
                    : "border-border text-muted-foreground hover:bg-surface-muted"
                }`}
              >
                {t("tierlistUnplace")}
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
