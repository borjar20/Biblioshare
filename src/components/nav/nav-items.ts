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
  key: "home" | "collection" | "search" | "clubs" | "profile";
  href: string;
  /** Clave de traducción bajo `nav.items`. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

// Fuente única de la navegación (§IA del rediseño Paper). La barra inferior
// (móvil) y la lateral (sm+) renderizan exactamente esto: si cambia una
// entrada, cambia en las dos.
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

// Una entrada está activa si la ruta coincide o cuelga de ella. "/" es
// excepción: sin esto, Inicio quedaría activo en todas las rutas.
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
