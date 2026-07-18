import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";
import { useItemStatus } from "./item-status-context";

// Acción "Seguir" compartida por las DOS caras de la ficha: la ficha son dos
// árboles distintos (ver item-shell.tsx), el hero de MÓVIL (HeroStatusOrFollow)
// y el rail de PC (ItemRailActions), y ambos necesitan seguir. Misma lógica en
// un solo sitio para que no diverjan.
//
// Logueado: "planned" optimista (el badge y la pestaña "Mi registro" reaccionan
// al instante vía ItemStatusContext) → salto a ?tab=log (canal que
// ItemDetailTabs vigila) → persistencia. Anónimo: solo dispara la acción, que
// redirige a /login server-side; sin optimismo ni navegación (no está siguiendo
// de verdad).
export function useFollow(
  itemType: ItemType,
  itemId: string,
  isLoggedIn: boolean,
): { follow: () => void; isPending: boolean } {
  const { setStatus } = useItemStatus();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function follow() {
    if (!isLoggedIn) {
      startTransition(() => addExistingItemToLibrary(itemType, itemId));
      return;
    }
    setStatus("planned");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "log");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    startTransition(() => addExistingItemToLibrary(itemType, itemId));
  }

  return { follow, isPending };
}
