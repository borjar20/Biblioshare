import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";
import { loginHref } from "@/lib/auth/safe-next";
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
  const { setStatus, setSaving } = useItemStatus();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function follow() {
    if (!isLoggedIn) {
      // Anónimo: a login recordando la ficha para volver tras entrar. Antes
      // disparaba la acción y el server redirigía a /login pelado (ida y vuelta
      // inútil y sin retorno) — issue #358.
      router.push(loginHref(pathname));
      return;
    }
    setStatus("planned");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "log");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // El optimismo de arriba desmonta el botón "Seguir" —y con él su
    // `isPending`— así que sin esto NADA en el DOM diría que la escritura sigue
    // en vuelo: el badge ya canta "Pendiente" cuando aún no hay fila en
    // `passes`, y quien vaya a /coleccion en ese medio segundo no ve la obra
    // (issue #106). El badge lo expone como aria-busy.
    setSaving(true);
    startTransition(async () => {
      try {
        await addExistingItemToLibrary(itemType, itemId);
      } finally {
        setSaving(false);
      }
    });
  }

  return { follow, isPending };
}
