"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// «⋯» de curación del hero de saga (spec 2026-10-27 §1). Sustituye la fila de
// enlaces sueltos de la antigua pestaña Info: Editar ficha, Anidar en universo
// (solo sin padre) e Itinerarios. Solo se monta para collaborator+.
// Mismo <dialog> nativo que `HeroMenu` de la ficha de obra.
export function SagaCuratorMenu({ sagaId, hasParent }: { sagaId: string; hasParent: boolean }) {
  const t = useTranslations("saga");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const item = "block rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-surface-muted";
  return (
    <>
      <button
        type="button"
        aria-label={t("curatorMenu")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface/80 text-foreground backdrop-blur-[6px] transition-colors hover:bg-surface"
      >
        <span aria-hidden className="text-base leading-none">⋯</span>
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-label={t("curatorMenu")}
        onClick={(e) => e.target === dialogRef.current && setOpen(false)}
        className="m-auto w-[min(92vw,320px)] rounded-card border border-border bg-surface p-2 text-foreground shadow-card backdrop:bg-scrim"
      >
        <Link href={`/saga/${sagaId}/editar`} className={item}>✎ {t("editSheet")}</Link>
        {!hasParent && <Link href={`/saga/${sagaId}/editar#universo`} className={item}>⌂ {t("nestInUniverse")}</Link>}
        <Link href={`/saga/${sagaId}/rutas`} className={item}>✎ {t("routesManage")}</Link>
      </dialog>
    </>
  );
}
