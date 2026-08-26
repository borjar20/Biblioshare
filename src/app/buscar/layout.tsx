import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// Provider i18n de sección (#444): unión de los namespaces de cliente que usan
// las rutas de esta sección. Ver src/components/route-messages.tsx.
export default function SectionMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["search"]}>{children}</RouteMessages>;
}
