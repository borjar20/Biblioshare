import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// ClubCard y ClubForm son cliente y leen club.*. Personas compone sus textos
// en servidor; no necesita enviar namespaces adicionales al navegador.
export default function CommunityMessagesLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["club"]}>{children}</RouteMessages>;
}
