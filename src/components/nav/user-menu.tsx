"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/social/user-avatar";
import { youItems } from "./nav-items";

// El avatar de la topbar era un enlace suelto a tu perfil. Ahora es la entrada
// a «Tú» (F3-010): perfil, Cuaderno, Estadísticas y Ajustes.
//
// NO se reutiliza ActionMenu aunque el comportamiento sea casi idéntico: sus
// items son <button onSelect>, y estos son NAVEGACIÓN. Un destino tiene que
// abrirse en pestaña nueva con ctrl+clic o con el botón central, y un botón que
// llama a router.push() no hace ninguna de las dos cosas — es la diferencia
// entre un menú de acciones y un menú de navegación. Lo que sí se copia es la
// mecánica accesible de ActionMenu: aria-haspopup, cierre por Escape y por
// puntero fuera.
export function UserMenu({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // El estado NO es un booleano sino «desde qué ruta se abrió», y `open` se
  // DERIVA comparándola con la actual. Con Cache Components la navegación soft
  // no desmonta este componente, así que un `open` booleano se quedaría abierto
  // encima de la página nueva (#448) — y cerrarlo con un efecto sobre
  // `pathname` es justo el `setState` dentro de `useEffect` que el compilador
  // de React marca como render en cascada. Derivarlo no necesita efecto: en
  // cuanto la ruta cambia, `open` ya es false.
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  const open = openedFrom !== null && openedFrom === pathname;
  const close = () => setOpenedFrom(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenedFrom(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenedFrom(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = youItems(username);

  return (
    <div ref={rootRef} className="relative ml-1 hidden shrink-0 sm:block">
      <button
        type="button"
        aria-label={t("youLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenedFrom(open ? null : pathname)}
        className="block rounded-full tap-44"
      >
        <UserAvatar name={username} avatarUrl={avatarUrl} size={34} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[42px] right-0 z-50 min-w-[184px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card"
        >
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.key}
                href={item.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={close}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors hover:bg-surface-muted ${
                  active ? "font-semibold text-foreground" : "text-foreground"
                }`}
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
