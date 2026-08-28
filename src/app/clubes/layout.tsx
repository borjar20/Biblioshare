import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// Provider i18n de ruta (#444): namespaces de cliente medidos para /clubes.
export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["club"]}>{children}</RouteMessages>;
}
