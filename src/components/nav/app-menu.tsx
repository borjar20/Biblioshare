"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { EllipsisIcon } from "@/components/ui/icons";
import { appMenuItems } from "./nav-items";

export function AppMenu({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // SessionChrome vive bajo Suspense de AppShell. La URL completa cambia
  // también entre vistas de una ruta y al recorrer el historial nativo.
  // Reiniciar solo esta capa transitoria evita restaurar un menú abierto.
  const navigationKey = `${pathname}?${searchParams.toString()}`;
  return <AppMenuPanel key={navigationKey} pathname={pathname} authenticated={authenticated} />;
}

function AppMenuPanel({ pathname, authenticated }: { pathname: string; authenticated: boolean }) {
  const t = useTranslations("nav");
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstFocus = useRef<"first" | "last">("first");
  const items = appMenuItems(authenticated);

  useEffect(() => {
    if (!open) return;
    const links = menuRef.current?.querySelectorAll<HTMLAnchorElement>("[role='menuitem']");
    links?.[firstFocus.current === "first" ? 0 : links.length - 1]?.focus();

    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    function onFocus(event: FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const links = Array.from(menuRef.current?.querySelectorAll<HTMLAnchorElement>("[role='menuitem']") ?? []);
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? links.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    links[next]?.focus();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("moreLabel")}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        onClick={() => { firstFocus.current = "first"; setOpen((current) => !current); }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          firstFocus.current = event.key === "ArrowDown" ? "first" : "last";
          setOpen(true);
        }}
        className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <EllipsisIcon className="h-5 w-5" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("moreLabel")}
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-50 mt-1 min-w-[184px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card"
        >
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${active ? "font-semibold" : ""}`}
              >
                <item.Icon className="h-4 w-4 text-muted-foreground" />
                {t(`you.${item.labelKey}`)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
