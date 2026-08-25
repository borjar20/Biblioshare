"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EllipsisIcon } from "@/components/ui/icons";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Rojo de acción destructiva (salir, expulsar). */
  danger?: boolean;
  /** Asidero para los e2e cuando la etiqueta no basta (o es interpolada). */
  testId?: string;
};

// Menú de acciones «⋯» ligero y accesible: no hay primitiva de dropdown en el
// proyecto y no merece traerse una dependencia por dos o tres items. Botón con
// aria-haspopup, cierre por Escape y clic fuera, foco visible en cada opción.
// El disparador es un «⋯» cuyo estilo lo fija el consumidor (banner del club,
// iconbtn de una fila de miembro…). Los `false` en items se descartan, para
// poder gatear opciones en línea sin filtros externos.
export function ActionMenu({
  label,
  items,
  triggerClassName,
  triggerTestId,
  menuAlign = "right",
}: {
  label: string;
  items: (ActionMenuItem | false)[];
  /** Clases del botón «⋯». Cada sitio lo enmarca distinto. */
  triggerClassName?: string;
  /** Asidero para los e2e que antes pinchaban el control que este menú sustituye. */
  triggerTestId?: string;
  menuAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((it): it is ActionMenuItem => Boolean(it));

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

  if (visible.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-testid={triggerTestId}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // `tap-44` se añade SIEMPRE, también cuando el consumidor trae su
        // propio `triggerClassName`: los cinco sitios que lo personalizan lo
        // dibujan entre 24 y 34px, y la regla táctil no puede depender de que
        // cada uno se acuerde de pedirla. Va al final para que gane el orden.
        className={`${
          triggerClassName ??
          "grid h-[30px] w-[30px] place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        } tap-44`}
      >
        <EllipsisIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          // z-50 (capa de popover): por encima de contenido decorativo con
          // z-index propio, p. ej. el abanico del detalle de colección (sus
          // portadas van a z-30 y, con un z-10, se pintaban por encima del menú).
          className={`absolute top-[38px] z-50 min-w-[168px] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card ${
            menuAlign === "right" ? "right-0" : "left-0"
          }`}
        >
          {visible.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              data-testid={it.testId}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted disabled:opacity-60 ${
                it.danger ? "text-status-dropped" : "text-foreground"
              }`}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
