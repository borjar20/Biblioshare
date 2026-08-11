import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Provider i18n de sección (#444): unión de los namespaces de cliente que usan
// las rutas de esta sección. Ver src/components/route-messages.tsx.
export default function SectionMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["saga", "sagaIndex"]}>{children}</RouteMessages>;
}
