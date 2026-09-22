"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function AdminNav() {
  const t = useTranslations("adminModeration");
  const path = usePathname();
  const links = [
    ["/admin/reportes", "reports"], ["/admin/contenido", "content"],
    ["/admin/clubes", "clubs"], ["/admin", "users"], ["/admin/historial", "history"],
  ] as const;
  return <nav aria-label={t("navigation")} className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto border-b border-border px-4 pt-5 sm:px-6">
    {links.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
      className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${path === href ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {t(`sections.${label}`)}
    </Link>)}
  </nav>;
}
