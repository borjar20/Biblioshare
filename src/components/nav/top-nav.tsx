"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { anonPrimaryNavItems, primaryNavItems, isNavItemActive } from "./nav-items";

// Nav horizontal de la topbar (sm+). Sustituye a la SideNav lateral: las
// maquetas de escritorio no tienen columna, sino wordmark + estas cuatro
// entradas en la propia topbar (P-T1). Solo texto, sin icono — el icono es
// cosa de la tabbar móvil.
export function TopNav({ username }: { username: string | null }) {
  const t = useTranslations("nav.items");
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-5 sm:flex">
      {(username ? primaryNavItems(username) : anonPrimaryNavItems()).map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`text-[13px] transition-colors ${
              active
                ? "font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
