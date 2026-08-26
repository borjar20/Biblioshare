import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// Provider i18n de sección (#444): unión de los namespaces de cliente que usan
// las rutas de esta sección. Ver src/components/route-messages.tsx.
//
// `search` viaja aquí (issue #640) porque `collection-items.tsx` (CLIENTE, el
// detalle de una colección) pide `search.types.*` para las píldoras de tipo —
// sin el namespace, `useTranslations()` no tiene esas claves y next-intl
// renderiza la ruta literal (`search.types.book`) en vez de fallar. Es el
// ÚNICO sitio de client afectado: `library-filters.tsx` y
// `collection-summary.tsx` usan las mismas claves pero son componentes de
// SERVIDOR (`getTranslations()`), que sí ven el bundle completo — no dependen
// de este array. Se descartó duplicar las 3 etiquetas en `collection.*`: el
// namespace `search` pesa ~1.5 KB y ya es la fuente canónica que usa
// `/buscar` y el perfil de visitante: mejor reusar que mantener dos copias.
export default function SectionMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["collection", "library", "search"]}>{children}</RouteMessages>;
}
