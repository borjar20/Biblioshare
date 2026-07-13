"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { navItems, isNavItemActive } from "./nav-items";

// Barra inferior (solo móvil). En sm+ la sustituye SideNav.
export function BottomNav({ username }: { username: string }) {
  const t = useTranslations("nav.items");
  const pathname = usePathname();
  const items = navItems(username);

  return (
    <nav className="sticky bottom-0 z-20 flex justify-around border-t border-border bg-background/90 px-2 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
      {items.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 font-mono text-[10px] transition-colors ${
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
