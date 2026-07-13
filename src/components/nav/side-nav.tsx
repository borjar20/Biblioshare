"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navItems, isNavItemActive } from "./nav-items";
import { AppLogoIcon } from "@/components/ui/icons";

// Nav lateral (sm+). Mismas entradas que la barra inferior — los mockups solo
// cubren móvil, así que en escritorio se presenta como columna en vez de
// estirar una barra inferior a lo ancho.
export function SideNav({ username }: { username: string }) {
  const t = useTranslations("nav.items");
  const pathname = usePathname();
  const items = navItems(username);

  return (
    <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col gap-1 border-r border-border px-3 py-4 sm:flex lg:w-60">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-2 px-2 text-sm font-semibold tracking-tight"
      >
        <AppLogoIcon className="h-5 w-5 text-accent" />
        Biblioshare
      </Link>

      {items.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors ${
              active
                ? "bg-surface-muted font-medium text-accent"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            <item.Icon className="h-5 w-5 shrink-0" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </aside>
  );
}
