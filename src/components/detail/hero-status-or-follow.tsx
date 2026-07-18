"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { Button } from "@/components/ui/button";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";
import { useItemStatus, StatusBadgeLive } from "./item-status-context";

// El hueco del hero (statusSlot): sin pase → botón "Seguir"; con pase → la
// píldora de estado viva de siempre. Antes "Seguir" vivía escondido dentro de
// la pestaña Mi registro; aquí es visible desde cualquier pestaña.
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
  const { status, setStatus } = useItemStatus();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (status !== null) {
    return <StatusBadgeLive labels={statusLabels} />;
  }

  function follow() {
    // Anónimo: la server action redirige a /login. Sin optimismo ni navegación
    // a la pestaña — no está siguiendo de verdad.
    if (!isLoggedIn) {
      startTransition(() => addExistingItemToLibrary(itemType, itemId));
      return;
    }
    // Logueado: "planned" optimista (el badge del hero y la pestaña "Mi
    // registro" reaccionan al instante), salto a la pestaña vía ?tab=log (canal
    // que ItemDetailTabs vigila) y persistencia.
    setStatus("planned");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "log");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    startTransition(() => addExistingItemToLibrary(itemType, itemId));
  }

  return (
    <Button type="button" disabled={isPending} onClick={follow}>
      {isPending ? t("following") : t("follow")}
    </Button>
  );
}
