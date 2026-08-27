"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { useItemStatus, StatusBadgeLive } from "./item-status-context";
import { useFollow } from "./use-follow";

// El hueco del hero (statusSlot, SOLO móvil — ver item-shell.tsx): sin pase →
// botón "Seguir"; con pase → la píldora de estado viva de siempre. Antes
// "Seguir" vivía escondido dentro de la pestaña Mi registro; aquí es visible sin
// abrir pestaña. La cara de PC (rail) tiene su propio "Seguir" en ItemRailActions
// con la MISMA acción (useFollow).
//
// El hero se renderiza FUERA del <Suspense> de las pestañas, así que NO tiene
// las ediciones (llegan por streaming). Por eso "Seguir" añade directo como
// "planned" y la pregunta "¿qué edición?" se difiere a cuando se empieza a leer
// (panel Progreso), donde las ediciones ya están cargadas.
export function HeroStatusOrFollow({
  itemType,
  itemId,
  isLoggedIn,
  statusLabels,
  ctaHref,
  ctaLabel,
}: {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  statusLabels: Record<MediaStatus, string>;
  /**
   * El MISMO CTA del rail (`ItemRailActions`), que en móvil no existía: el rail
   * es `hidden lg:block`, así que una obra con pase abierto se quedaba sin
   * ninguna acción primaria en las tres pestañas — medido a 390px, cero
   * elementos con fondo de acento visibles. Y la asimetría era la mala: la obra
   * que NO tienes sí pintaba su terracota («Seguir»); la que estás leyendo, no.
   * Registrar es el gesto que da nombre al producto y el móvil es donde se
   * captura, así que el CTA vive en las dos caras. Null = sin pase activo (el
   * hueco lo ocupa «Seguir») o el tipo no ofrece acción.
   */
  ctaHref?: string | null;
  ctaLabel?: string;
}) {
  const t = useTranslations("item");
  const { status } = useItemStatus();
  const { follow, isPending } = useFollow(itemType, itemId, isLoggedIn);

  if (status !== null) {
    return (
      <>
        <StatusBadgeLive labels={statusLabels} />
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            // Píldora, no la caja de 10px del rail: este botón comparte hueco
            // con «Seguir» y con la píldora de estado, y la regla de forma dice
            // que lo que se pulsa es píldora.
            className={buttonVariants("primary", "gap-1.5 whitespace-nowrap")}
          >
            <PlusIcon aria-hidden className="h-4 w-4" />
            {ctaLabel}
          </Link>
        )}
      </>
    );
  }

  return (
    // Ancho calcado a la portada del hero (w-[116px] / sm:w-40, ver
    // item-hero.tsx): el botón queda como una "base" alineada justo debajo de
    // ella en móvil, no un pill suelto más estrecho.
    <Button
      type="button"
      disabled={isPending}
      onClick={follow}
      className="w-[116px] whitespace-nowrap sm:w-40"
    >
      {isPending ? t("following") : t("follow")}
    </Button>
  );
}
