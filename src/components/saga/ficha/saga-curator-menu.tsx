"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// «⋯» de curación del hero de saga (spec 2026-10-27 §1). Sustituye la fila de
// enlaces sueltos de la antigua pestaña Info: Editar ficha, Anidar en universo
// (solo sin padre) e Itinerarios. Solo se monta para collaborator+.
// Mismo <dialog> nativo que `HeroMenu` de la ficha de obra.
//
// OJO (TRAMPAS §26): con cacheComponents la ficha NO se desmonta al seguir uno
// de estos enlaces, se oculta con <Activity> (display: none). Un <dialog>
// abierto con showModal() sigue entonces en la top layer aunque no se vea, y
// deja inerte todo lo demás: en /editar «Guardar cambios» no recibía el clic.
// Por eso el diálogo se cierra al pulsar un enlace y, como red, en la limpieza
// de un layout effect, que corre síncrona cuando Activity oculta el árbol.
export function SagaCuratorMenu({ sagaId, hasParent }: { sagaId: string; hasParent: boolean }) {
  const t = useTranslations("saga");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  // Al volver a la ficha (Activity la vuelve visible) el menú debe estar
  // cerrado: es una interacción de paso, no estado de vista que conservar.
  useLayoutEffect(() => () => setOpen(false), []);

  const close = () => setOpen(false);
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
        onClose={close}
        aria-label={t("curatorMenu")}
        onClick={(e) => e.target === dialogRef.current && close()}
        className="m-auto w-[min(92vw,320px)] rounded-card border border-border bg-surface p-2 text-foreground shadow-card backdrop:bg-scrim"
      >
        <Link href={`/saga/${sagaId}/editar`} onClick={close} className={item}><span aria-hidden>✎</span> {t("editSheet")}</Link>
        {!hasParent && (
          <Link href={`/saga/${sagaId}/editar#universo`} onClick={close} className={item}><span aria-hidden>⌂</span> {t("nestInUniverse")}</Link>
        )}
        <Link href={`/saga/${sagaId}/rutas`} onClick={close} className={item}><span aria-hidden>✎</span> {t("routesManage")}</Link>
      </dialog>
    </>
  );
}
