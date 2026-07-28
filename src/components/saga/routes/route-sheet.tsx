"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { RouteForm } from "./route-form";
import type { RouteRowData } from "./route-row";

/** Chasis común de las dos hojas. `<dialog>` nativo con `showModal()`, como el
 *  resto de hojas del repo (`sequence/row-sheet.tsx`, `item-connect-sheet.tsx`):
 *  trae gratis el cierre con Escape, la trampa de foco y el `inert` del fondo.
 *  Reimplementarlo con un div superpuesto sería perder las tres cosas.
 *
 *  Pegada abajo en móvil y modal centrado en `lg`, el mismo breakpoint en que
 *  se cambian las cáscaras: en escritorio no hay pulgar al que acercarla. */
function SheetShell({
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
  useEffect(() => {
    ref.current?.showModal();
  }, []);

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
            <span className="font-mono text-[9px] uppercase tracking-wide text-foreground-faint">{caption}</span>
          )}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** Menú de una fila y, dentro, la zona de peligro del borrado — la misma
 *  confirmación en dos pasos de `saga-meta-editor.tsx`, porque es el mismo tipo
 *  de borrado en cascada: `saga_route_entries` cuelga de `route_id` con
 *  `on delete cascade`, así que se lleva por delante todos los pasos. */
export function RouteSheet({
  row,
  sagaId,
  busy,
  onRename,
  onDesignate,
  onDelete,
  deleting,
  deleteError,
  onClose,
}: {
  row: RouteRowData;
  sagaId: string;
  busy: boolean;
  onRename: () => void;
  onDesignate: () => void;
  onDelete: () => void;
  deleting: boolean;
  deleteError: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const [confirming, setConfirming] = useState(false);
  const item =
    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] font-medium hover:bg-surface-muted disabled:opacity-40";

  return (
    <SheetShell title={row.name} caption={t("routeStepsCount", { count: row.steps })} onClose={onClose}>
      <div className="grid gap-0.5">
        <Link href={`${sagaHref(sagaId)}/rutas/${row.slug}/editar`} className={item}>
          {t("routeEditSteps")}
        </Link>
        <button type="button" onClick={onRename} disabled={busy} className={item}>
          {t("routeRename")}
        </button>
        <button
          type="button"
          onClick={onDesignate}
          disabled={busy || row.isReadingOrder || row.steps === 0}
          className={item}
        >
          {t("routeUseAsReadingOrder")}
        </button>
        <hr className="my-1.5 border-border" />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy || confirming}
          className={`${item} text-status-dropped`}
        >
          {t("routeDelete")}
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-xl border border-status-dropped/50 bg-status-dropped/[0.07] p-3">
          <b className="mb-1.5 block font-serif text-[14px]">{t("routeDeleteTitle", { name: row.name })}</b>
          <p className="mb-2.5 text-[12px] leading-snug text-muted-foreground">{t("routeDeleteBody")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] font-semibold disabled:opacity-40"
            >
              {t("routeCancel")}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="rounded-lg border border-status-dropped/40 px-2.5 py-1.5 text-[11.5px] font-semibold text-status-dropped disabled:opacity-40"
            >
              {deleting ? t("routeDeleting") : t("routeDeleteConfirm")}
            </button>
          </div>
          {deleteError && <p className="mt-2 text-[11.5px] text-status-dropped">{t("routeErrors.generic")}</p>}
        </div>
      )}
    </SheetShell>
  );
}

/** El formulario en hoja: crear desde móvil y renombrar desde cualquier
 *  tamaño. El raíl de escritorio monta `RouteForm` directamente, sin hoja. */
export function RouteFormSheet({
  title,
  sagaId,
  route,
  onClose,
}: {
  title: string;
  sagaId: string;
  route: { id: string; name: string; summary: string | null } | null;
  onClose: () => void;
}) {
  return (
    <SheetShell title={title} onClose={onClose}>
      <RouteForm sagaId={sagaId} route={route} idPrefix="sheet" onDone={onClose} onCancel={onClose} />
    </SheetShell>
  );
}
