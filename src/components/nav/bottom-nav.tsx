"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { anonNavItems, navItems, isNavItemActive } from "./nav-items";
import { isFullscreenRoute } from "./fullscreen-routes";

// Barra inferior (móvil y tablet estrecha). En md+ la sustituyen las entradas de la topbar
// (TopNav). Ambos viewports muestran los mismos cinco destinos.
export function BottomNav({ username }: { username: string | null }) {
  const t = useTranslations("nav.items");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  // En /post/[id] (posts Spec 2b) el composer del hilo va anclado al borde
  // inferior en móvil; la nav le cedería el sitio o se solaparían, así que se
  // retira en esa pantalla-conversación (se vuelve por el back de la topbar).
  // Y en el tablero de una partida, que se come el marco entero (#931). Va aquí
  // ADEMÁS de en `ChromeGate` a propósito: el gate quita el árbol desde el armazón,
  // y esto deja el componente correcto aunque alguien lo monte por su cuenta.
  if (pathname.startsWith("/post/") || isFullscreenRoute(pathname)) return null;
  const items = username ? navItems() : anonNavItems();

  return (
    <nav aria-label={tNav("primaryLabel")} className="sticky bottom-0 z-20 flex justify-around border-t border-border bg-background/90 px-2 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      {items.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 flex-col items-center gap-1 font-mono text-[10px] transition-colors ${
              active
                ? "text-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.Icon className="h-5 w-5" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
