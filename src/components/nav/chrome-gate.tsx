"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isFullscreenRoute } from "./fullscreen-routes";

const subscribe = () => () => {};

/**
 * Deja pasar el chrome —que se renderiza en SERVIDOR— salvo en las pantallas a
 * sangre. Mismo mecanismo que ya usaba `BottomNav` para `/post/*`, elevado a
 * componente porque aquí hay que retirar TAMBIÉN la topbar y `Header` es de
 * servidor: un componente cliente puede decidir si pinta a sus `children` sin
 * convertirlos en cliente.
 */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const snapshotId = useId();
  const fullscreen = useSyncExternalStore(
    subscribe,
    () => isFullscreenRoute(pathname),
    () => {
      // El gate puede hidratarse DESPUÉS de una navegación (#1534). La ruta
      // vigente ya no describe su HTML SSR: recuperamos su visibilidad original
      // serializada y React aplica getSnapshot sólo tras hidratar este gate.
      const snapshot = typeof document === "undefined"
        ? null
        : document.getElementById(snapshotId)?.getAttribute("data-fullscreen") ?? null;
      return snapshot === null ? isFullscreenRoute(pathname) : snapshot === "true";
    },
  );
  return (
    <>
      <template id={snapshotId} data-fullscreen={fullscreen ? "true" : "false"} />
      {fullscreen ? null : children}
    </>
  );
}
