import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Provider i18n de ruta (#444): namespaces de cliente medidos para esta ruta.
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["admin"]}>{children}</RouteMessages>;
}
