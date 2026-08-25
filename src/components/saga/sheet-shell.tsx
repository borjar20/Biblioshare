"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/** Chasis común de toda hoja del editor de sagas. `<dialog>` nativo con
 *  `showModal()`, como el resto de hojas del repo (`sequence/row-sheet.tsx`,
 *  `item-connect-sheet.tsx`): trae gratis el cierre con Escape, la trampa de
 *  foco y el `inert` del fondo. Reimplementarlo con un div superpuesto sería
 *  perder las tres cosas.
 *
 *  Pegada abajo en móvil y modal centrado en `lg`, el mismo breakpoint en que
 *  se cambian las cáscaras: en escritorio no hay pulgar al que acercarla. */
export function SheetShell({
  title,
  caption,
  onClose,
  children,
}: {
  title: string;
  caption?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("sagaEditor");
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const navGuard = useRef(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Alguna hoja del editor navega estando abierta (p.ej. RouteSheet -> "editar
  // pasos"). Con Cache Components la hoja NO se desmonta en navegación soft: el
  // <dialog> quedaría con `open=true` pero fuera del top layer al volver, roto e
  // incerrable (#448, como item-connect-sheet). Al cambiar de ruta se cierra. El
  // primer render se salta: la hoja acaba de abrirse EN esa ruta.
  useEffect(() => {
    if (!navGuard.current) {
      navGuard.current = true;
      return;
    }
    ref.current?.close();
  }, [pathname]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto mb-0 mt-auto w-full max-w-lg rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim lg:mb-auto lg:rounded-2xl"
    >
      <div className="px-4 pb-5 pt-3.5">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-surface-3 lg:hidden" aria-hidden />
        <div className="mb-3.5 flex items-baseline gap-2.5">
          <b className="min-w-0 flex-1 truncate font-serif text-[16px] font-semibold">{title}</b>
          {caption && (
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{caption}</span>
          )}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("close")}
            className="tap-44 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
