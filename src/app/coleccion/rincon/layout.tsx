import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// El Rincón reutiliza las islas de objetivos, retos, memorizar y sorteo que
// antes heredaban estos mensajes del perfil. El provider reemplaza al de
// Biblioteca, así que conserva también sus namespaces (search.types se usa
// en el formulario y las tarjetas de retos). BASE lo añade RouteMessages.
export default function CornerMessagesLayout({ children }: { children: ReactNode }) {
  return (
    <RouteMessages ns={["challenges", "collection", "library", "notes", "rincon", "search", "stats"]}>
      {children}
    </RouteMessages>
  );
}
