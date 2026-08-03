"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon, XIcon } from "@/components/ui/icons";

// Caparazón del desplegable de filtros: el botón «Filtros ▾» (con badge del nº
// de filtros activos), el panel que se abre debajo y el cierre por clic fuera /
// Escape. El CONTENIDO del panel lo pone quien lo usa — en Todo son enlaces que
// navegan por la URL (filtrado server); en el detalle de colección son botones
// de estado local (filtrado en cliente). No se auto-cierra al pulsar dentro: en
// el detalle se encadenan varios filtros; en Todo el enlace navega y ya se va.
export function FiltersDropdown({
  label,
  activeCount,
  countLabel,
  children,
}: {
  label: string;
  activeCount: number;
  /** Texto a la izquierda (p. ej. «N de M») cuando hay filtros; opcional. */
  countLabel?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center justify-between gap-3">
      <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
        {activeCount > 0 && countLabel ? countLabel : ""}
      </span>

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
      >
        {label}
        {activeCount > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-accent-foreground">
            {activeCount}
          </span>
        )}
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        // En móvil, hoja a pantalla completa: como panel flotante se comía la
        // tabbar inferior (z-50 sobre su z-20) y encima se salía de la pantalla
        // cuando hay muchos géneros. En sm+ sigue siendo el desplegable anclado
        // al botón de siempre.
        <div
          role="menu"
          className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:absolute sm:inset-auto sm:top-[42px] sm:right-0 sm:w-[min(280px,92vw)] sm:overflow-visible sm:rounded-xl sm:border sm:border-border sm:p-3.5 sm:shadow-card"
        >
          <div className="flex items-center justify-between sm:hidden">
            <span className="font-serif text-base font-semibold text-foreground">
              {label}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
