"use client";

import { useCallback, useSyncExternalStore } from "react";
import { rememberedTableSnapshot } from "@/lib/play/ui/table-memory";
import type { MtgSetup } from "@/lib/play/mtg/types";

// La mesa recordada no cambia mientras el formulario está abierto (se reescribe al
// EMPEZAR una partida, y entonces esta pantalla ya no existe), así que no hay a qué
// suscribirse. La constante va fuera del hook: una función nueva por render provoca
// re-suscripción en bucle, misma trampa que ya documenta `use-active-game.ts`.
const subscribe = () => () => {};
const getServerSnapshot = () => null;

/**
 * Lee la última mesa usada. Con `useSyncExternalStore` y no con
 * `useState`+`useEffect`: leer `localStorage` en un efecto está prohibido por lint
 * (`set-state-in-effect`) y además pinta un primer render con el valor equivocado.
 * En servidor devuelve `null` y React re-renderiza tras hidratar.
 */
export function useRememberedTable(identity: string): MtgSetup | null {
  const getSnapshot = useCallback(() => rememberedTableSnapshot(identity), [identity]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
