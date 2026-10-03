import type { SVGProps } from "react";
import type { ComponentType } from "react";
import {
  AcornIcon,
  CompassIcon,
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
  key: "home" | "collection" | "experiences" | "community" | "search" | "login";
  href: string;
  /** Clave de traducción bajo `nav.items`. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

// Fuente única de la navegación (§IA del rediseño Paper). La barra inferior
// (móvil) y la topbar (sm+) salen de aquí: si cambia una entrada, cambia en
// las dos.
export function navItems(): NavItem[] {
  return [
    { key: "home", href: "/", labelKey: "home", Icon: HomeIcon },
    {
      key: "collection",
      href: "/coleccion",
      labelKey: "collection",
      Icon: LibraryIcon,
    },
    { key: "experiences", href: "/experiencias", labelKey: "experiences", Icon: CompassIcon },
    { key: "community", href: "/comunidad", labelKey: "community", Icon: UsersIcon },
    { key: "search", href: "/buscar", labelKey: "search", Icon: SearchIcon },
  ];
}

// Los cinco destinos son iguales en ambos viewports; la identidad tiene su
// enlace propio en el avatar y no consume un hueco de navegación.
export function primaryNavItems(): NavItem[] {
  return navItems();
}

// Una entrada está activa si la ruta coincide o cuelga de ella. "/" es
// excepción: sin esto, Inicio quedaría activo en todas las rutas.
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  const paths = item.key === "experiences" ? [item.href, "/experiencia"]
    : item.key === "community" ? [item.href, "/clubes", "/club"]
    : item.key === "collection" ? [item.href, "/notas", "/estadisticas"]
    : [item.href];
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Navegación para el usuario SIN sesión: solo los destinos públicos (Inicio,
// Comunidad, Buscar) más "Entrar". Biblioteca y Experiencias quedan fuera hasta que
// inicie sesión — su hueco lo ocupa el CTA de login del header.
export function anonNavItems(): NavItem[] {
  const all = navItems();
  const publicItems = all.filter(
    (i) => i.key === "home" || i.key === "search" || i.key === "community"
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
// Menú global de la app: destinos secundarios, separado del perfil.
// Partidas conserva su entrada pública; Mascota y Ajustes requieren sesión.
// Biblioteca y sus herramientas viven en su área, Experiencias es primaria.
// ---------------------------------------------------------------------------
export type AppMenuItem = {
  key: "play" | "pet" | "settings";
  href: string;
  /** Clave de traducción bajo `nav.you`. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function appMenuItems(authenticated: boolean): AppMenuItem[] {
  const items: AppMenuItem[] = [
    { key: "play", href: "/partidas", labelKey: "play", Icon: DiceIcon },
    { key: "pet", href: "/mascota", labelKey: "pet", Icon: AcornIcon },
    { key: "settings", href: "/ajustes", labelKey: "settings", Icon: GearIcon },
  ];
  return authenticated ? items : items.filter((item) => item.key === "play");
}

// ---------------------------------------------------------------------------
// Compatibilidad del antiguo YouRow, ya retirado del perfil.
// ---------------------------------------------------------------------------
export type YouItem = {
  key: "profile" | "experiences" | "play" | "pet" | "notes" | "stats" | "settings";
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
    { key: "play", href: "/partidas", labelKey: "play", Icon: DiceIcon },
    {key:"experiences",href:"/experiencias",labelKey:"experiences",Icon:CompassIcon},
    { key: "pet", href: "/mascota", labelKey: "pet", Icon: AcornIcon },
    { key: "notes", href: "/notas", labelKey: "notes", Icon: NoteIcon },
    { key: "stats", href: "/estadisticas", labelKey: "stats", Icon: PollIcon },
    { key: "settings", href: "/ajustes", labelKey: "settings", Icon: GearIcon },
  ];
}
