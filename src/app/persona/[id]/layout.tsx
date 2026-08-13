import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// La ficha de persona manda sus textos traducidos por props a los componentes
// de cliente (el control de estado de cada fila, «Ver más» de la biografía),
// así que no necesitaría provider… salvo por UNA pieza reutilizada: la hoja
// «Añadir a colección», que es de cliente y llama a `useTranslations` por su
// cuenta. Sin este namespace, abrir el menú «⋯» de una fila revienta con
// `MISSING_MESSAGE: Could not resolve 'collection'`.
export default function PersonLayout({ children }: { children: ReactNode }) {
  return <RouteMessages ns={["collection"]}>{children}</RouteMessages>;
}
