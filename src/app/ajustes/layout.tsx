import type { ReactNode } from "react";
import { RouteMessages } from "@/components/route-messages";

// Provider i18n de sección (#444). Sin esto la página COMPILA, se pinta entera
// y aun así sale mal: los componentes de cliente enseñan la clave cruda
// («profile.logout» en vez de «Cerrar sesión»), porque el provider raíz solo
// manda los namespaces del chrome. Es el modo de fallo que hay que recordar al
// mudar un componente de cliente de una ruta a otra — no hay error, hay texto
// feo. Los cuatro de aquí: `profile` (editar perfil, visibilidad, salir),
// `settings` (la página), `push` (avisos) y `social` (autopublicar).
export default function SectionMessagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RouteMessages ns={["profile", "settings", "push", "social"]}>
      {children}
    </RouteMessages>
  );
}
