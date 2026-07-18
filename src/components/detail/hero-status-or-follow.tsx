"use client";

import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { Button } from "@/components/ui/button";
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
}: {
  itemType: ItemType;
  itemId: string;
  isLoggedIn: boolean;
  statusLabels: Record<MediaStatus, string>;
}) {
  const t = useTranslations("item");
  const { status } = useItemStatus();
  const { follow, isPending } = useFollow(itemType, itemId, isLoggedIn);

  if (status !== null) {
    return <StatusBadgeLive labels={statusLabels} />;
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
