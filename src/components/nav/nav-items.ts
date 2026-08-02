import type { SVGProps } from "react";
import type { ComponentType } from "react";
import {
  HomeIcon,
  LibraryIcon,
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
