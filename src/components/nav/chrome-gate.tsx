"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isFullscreenRoute } from "./fullscreen-routes";

/**
 * Deja pasar el chrome —que se renderiza en SERVIDOR— salvo en las pantallas a
 * sangre. Mismo mecanismo que ya usaba `BottomNav` para `/post/*`, elevado a
 * componente porque aquí hay que retirar TAMBIÉN la topbar y `Header` es de
 * servidor: un componente cliente puede decidir si pinta a sus `children` sin
 * convertirlos en cliente.
 */
export function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFullscreenRoute(pathname)) return null;
  return <>{children}</>;
}
