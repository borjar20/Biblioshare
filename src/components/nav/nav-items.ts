import type { SVGProps } from "react";
import type { ComponentType } from "react";
import {
  GearIcon,
  HomeIcon,
  LibraryIcon,
  DiceIcon,
  NoteIcon,
  PollIcon,
  SearchIcon,
  UsersIcon,
  UserIcon,
} from "@/components/ui/icons";

export type NavItem = {
  key: "home" | "collection" | "search" | "clubs" | "profile" | "login";
  href: string;
  /** Clave de traducción bajo `nav.items`. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

// Fuente única de la navegación (§IA del rediseño Paper). La barra inferior
// (móvil) y la topbar (sm+) salen de aquí: si cambia una entrada, cambia en
// las dos.
export function navItems(username: string): NavItem[] {
  return [
    { key: "home", href: "/", labelKey: "home", Icon: HomeIcon },
    {
      key: "collection",
      href: "/coleccion",
      labelKey: "collection",
      Icon: LibraryIcon,
    },
    { key: "search", href: "/buscar", labelKey: "search", Icon: SearchIcon },
    { key: "clubs", href: "/clubes", labelKey: "clubs", Icon: UsersIcon },
    {
      key: "profile",
      href: `/u/${username}`,
      labelKey: "profile",
      Icon: UserIcon,
    },
  ];
}

// La topbar de escritorio solo lleva las cuatro primeras: Perfil no es un
// enlace más, sino el avatar de la derecha. Es lo que dan los cuatro frames de
// escritorio del handoff (Home B, Colección C, Buscar C, Perfil C), todos
// iguales; en móvil la tabbar sí conserva las cinco.
export function primaryNavItems(username: string): NavItem[] {
  return navItems(username).filter((item) => item.key !== "profile");
}

// Una entrada está activa si la ruta coincide o cuelga de ella. "/" es
// excepción: sin esto, Inicio quedaría activo en todas las rutas.
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// Navegación para el usuario SIN sesión: solo los destinos públicos (Inicio,
// Buscar, Clubes) más "Entrar". Colección y Perfil quedan fuera hasta que
// inicie sesión — su hueco lo ocupa el CTA de login del header.
export function anonNavItems(): NavItem[] {
  const all = navItems("");
  const publicItems = all.filter(
    (i) => i.key === "home" || i.key === "search" || i.key === "clubs"
  );
  return [
    ...publicItems,
    { key: "login", href: "/login", labelKey: "login", Icon: UserIcon },
  ];
}

// Igual que anonNavItems pero sin "Entrar": en escritorio el login vive como
// botón del header, no como entrada de la barra.
export function anonPrimaryNavItems(): NavItem[] {
  return anonNavItems().filter((i) => i.key !== "login");
}

// ---------------------------------------------------------------------------
// «Tú»: el segundo nivel de la navegación (F3-010 / F4-007)
// ---------------------------------------------------------------------------
// La app tiene ~8 áreas y la barra principal cinco huecos, así que lo que no
// cabía —Cuaderno, Estadísticas, Ajustes— no colgaba de NINGUNA navegación: se
// llegaba a Cuaderno desde una tarjeta del Rincón, a Estadísticas desde un
// enlace al pie de una pestaña del perfil, y a los ajustes desde un engranaje
// que abría una hoja modal. Un tercio de la app era inalcanzable sin saberse
// el camino de memoria.
//
// La regla de reparto: **si es TUYO, cuelga de Tú.** Lo que es del catálogo
// (Sagas, Géneros) cuelga de Buscar, que es donde se descubre. Por eso Sagas NO
// entra en esta lista aunque también estuviera enterrada: no es tuya.
//
// Se sirve en dos sitios y por eso vive aquí, no dentro de un componente: el
// menú del avatar (sm+, donde el avatar ES la entrada a lo tuyo) y la fila de
// accesos del perfil propio (móvil, donde la entrada es la pestaña Perfil de la
// barra inferior). Misma lista, dos formas de enseñarla, un solo sitio que tocar.
export type YouItem = {
  key: "profile" | "play" | "notes" | "stats" | "settings";
  href: string;
  /** Clave de traducción bajo `nav.you`. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function youItems(username: string): YouItem[] {
  return [
    {
      key: "profile",
      href: `/u/${username}`,
      labelKey: "profile",
      Icon: UserIcon,
    },
    // Partidas cuelga de «Tú» por la regla de reparto de arriba: es TUYO. La barra
    // de cinco no se toca (decisión previa), y el anónimo llega por URL o por la
    // PWA — no entra en anonNavItems de momento.
    { key: "play", href: "/partidas", labelKey: "play", Icon: DiceIcon },
    { key: "notes", href: "/notas", labelKey: "notes", Icon: NoteIcon },
    { key: "stats", href: "/estadisticas", labelKey: "stats", Icon: PollIcon },
    { key: "settings", href: "/ajustes", labelKey: "settings", Icon: GearIcon },
  ];
}
