"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Chasis de las hojas de Play. `<dialog>` nativo con `showModal()`, como el resto de
 * hojas del repo (`saga/sheet-shell.tsx`, `sequence/row-sheet.tsx`): trae gratis el
 * cierre con Escape, la trampa de foco y el `inert` del fondo. Reimplementarlo con
 * un div superpuesto sería perder las tres cosas — y en una pantalla sin topbar ni
 * barra inferior, la trampa de foco es lo único que mantiene el teclado dentro.
 *
 * No reutiliza `SheetShell` de sagas porque aquel lee el namespace `sagaEditor` y un
 * componente de Play no puede leer namespaces de otra área (`inv-t-no-cruza`).
 *
 * Las hojas NO giran: salen de abajo y derechas, porque las abre quien tiene el
 * móvil en la mano (a diferencia del overlay de daño, que vive dentro del panel).
 */
export function PlaySheet({
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
  const t = useTranslations("play");
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const openedAt = useRef(pathname);

  useEffect(() => {
    // Idempotente: `showModal()` sobre un diálogo ya abierto lanza InvalidStateError,
    // y en desarrollo React monta los efectos DOS veces (StrictMode).
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  // Con Cache Components la hoja NO se desmonta en navegación soft: el `<dialog>`
  // quedaría con `open=true` pero fuera del top layer al volver, roto e incerrable
  // (#448). Al cambiar de ruta se cierra.
  //
  // La guarda compara la RUTA en la que se abrió, no un booleano «ya pasé por aquí».
  // Con el booleano, la segunda pasada de StrictMode encuentra el flag ya puesto y
  // cierra la hoja recién abierta — el efecto es que el menú no abre en desarrollo, y
  // costó un rato encontrarlo porque no da ningún error.
  useEffect(() => {
    if (openedAt.current === pathname) return;
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
      className="m-auto mb-0 mt-auto w-full max-w-md rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim lg:mb-auto lg:rounded-2xl"
    >
      <div className="px-4 pb-5 pt-3.5">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-surface-3 lg:hidden" aria-hidden />
        <div className="mb-3.5 flex items-baseline gap-2.5">
          <b className="min-w-0 flex-1 truncate font-serif text-[16px] font-semibold">{title}</b>
          {caption && (
            <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {caption}
            </span>
          )}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("board.close")}
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

/**
 * Grupo de filas de acción: caja con borde y separadores entre filas. Es lo que hace
 * que las filas SE VEAN accionables — sueltas sobre la hoja parecían texto corrido,
 * sin frontera entre una acción y la siguiente (revisión sobre partida real,
 * 2026-08-30). Las etiquetas de sección van FUERA del grupo: así lo accionable
 * (dentro de la caja) y lo que solo rotula (fuera) no se confunden.
 */
export function SheetGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
      {children}
    </div>
  );
}

/** Fila de acción de una hoja: etiqueta, el estado actual a la derecha y chevron. */
export function SheetRow({
  label,
  value,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[14px] transition-colors hover:bg-surface-muted active:bg-surface-muted disabled:opacity-40 ${
        danger ? "text-play-danger" : ""
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value && (
        <span className="min-w-0 shrink truncate font-mono text-[11px] text-muted-foreground">
          {value}
        </span>
      )}
      {/* El chevron dice «esto se toca» sin decir nada nuevo: es afordancia pura. */}
      <span aria-hidden className="shrink-0 text-[13px] text-muted-foreground">
        ›
      </span>
    </button>
  );
}
