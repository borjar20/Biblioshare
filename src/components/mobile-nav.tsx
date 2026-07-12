"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./theme-toggle";
import {
  MenuIcon,
  XIcon,
  SearchIcon,
  GripVerticalIcon,
  TrophyIcon,
  UsersIcon,
  UserIcon,
} from "@/components/ui/icons";

const linkClassName =
  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-surface-muted";

// El nav inline del header colapsa a solo iconos en móvil, pero con hasta 7
// botones seguía apretándose/solapando en pantallas estrechas — este drawer
// lo sustituye por debajo de `sm:`, donde el nav inline permanece oculto.
export function MobileNav({
  username,
  isAdmin,
}: {
  username: string | null;
  isAdmin: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-label={t("nav.openMenu")}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-30">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.openMenu")}
            className="absolute right-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-1 border-l border-border bg-surface p-4 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-end">
              <button
                type="button"
                aria-label={t("nav.closeMenu")}
                onClick={close}
                className="inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <Link href="/buscar" onClick={close} className={linkClassName}>
              <SearchIcon className="h-4 w-4" />
              {t("search.title")}
            </Link>
            <Link href="/cola" onClick={close} className={linkClassName}>
              <GripVerticalIcon className="h-4 w-4" />
              {t("queue.title")}
            </Link>
            <Link href="/retos" onClick={close} className={linkClassName}>
              <TrophyIcon className="h-4 w-4" />
              {t("challenges.navLabel")}
            </Link>
            <Link href="/usuarios" onClick={close} className={linkClassName}>
              <UsersIcon className="h-4 w-4" />
              {t("users.navLabel")}
            </Link>
            <Link href="/clubes" onClick={close} className={linkClassName}>
              {t("club.navLabel")}
            </Link>
            {isAdmin && (
              <Link href="/admin" onClick={close} className={linkClassName}>
                {t("admin.navLabel")}
              </Link>
            )}
            {username && (
              <Link
                href={`/u/${username}`}
                onClick={close}
                className={linkClassName}
              >
                <UserIcon className="h-4 w-4" />@{username}
              </Link>
            )}
            <div className="mt-auto border-t border-border pt-2">
              <ThemeToggle asRow />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
