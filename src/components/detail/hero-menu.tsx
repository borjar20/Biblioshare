"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { removeFromLibrary } from "@/lib/library/manage-actions";
import { useItemStatus } from "@/components/detail/item-status-context";
import { PencilIcon, XIcon } from "@/components/ui/icons";

// El `⋯` de la barra superior del hero móvil (P2 del plan 06, DECIDIDO):
// quitar de mi biblioteca y editar ficha (colaborador+). Las dos acciones
// conservan su sitio de siempre (el enlace rojo del Registro y el botón junto
// a la Sinopsis) — esto es el segundo punto de entrada que el frame dibuja,
// no un traslado.
//
// Mismo <dialog> nativo que las hojas de pase (foco, Escape y clic fuera
// gratis). Solo existe en móvil: la barra superior del hero es `.hero-top`,
// que en PC no se pinta (§2bis.30).
export function HeroMenu({
  itemType,
  itemId,
  canEditCatalog,
}: {
  itemType: ItemType;
  itemId: string;
  canEditCatalog: boolean;
}) {
  const t = useTranslations("item");
  const tMenu = useTranslations("detail.heroMenu");
  const tEdit = useTranslations("catalogEdit");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const { status, setStatus } = useItemStatus();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const inLibrary = status !== null;

  // Sin nada que ofrecer (visitante, u obra fuera de la biblioteca sin rol),
  // el hueco simétrico de 34px de siempre: el label del tipo sigue centrado.
  if (!inLibrary && !canEditCatalog) {
    return <span aria-hidden className="h-[34px] w-[34px] shrink-0" />;
  }

  return (
    <>
      <button
        type="button"
        aria-label={tMenu("open")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface/80 text-foreground backdrop-blur-[6px] transition-colors hover:bg-surface"
      >
        <span aria-hidden className="text-base leading-none">
          ⋯
        </span>
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-label={tMenu("open")}
        className="m-auto w-[min(360px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="flex flex-col py-1.5">
          {canEditCatalog && (
            <button
              type="button"
              onClick={() => {
                dialogRef.current?.close();
                // `?editar=ficha` abre el editor de moderador; ?tab=info
                // porque el editor vive en esa pestaña (ItemDetailTabs sigue
                // la URL, ver el ajuste en item-detail-tabs.tsx).
                router.replace(`${pathname}?tab=info&editar=ficha`, {
                  scroll: false,
                });
              }}
              className="flex items-center gap-3 px-5 py-3.5 text-left text-sm font-medium hover:bg-surface-muted"
            >
              <PencilIcon aria-hidden className="h-4 w-4 text-muted-foreground" />
              {tEdit("edit")}
            </button>
          )}

          {inLibrary && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                // La misma acción que el enlace rojo del Registro y, por
                // tanto, la misma pregunta (F3-012): borra todos los pases.
                if (!window.confirm(t("unfollowConfirm"))) return;
                // Mismo gesto que el enlace rojo del Registro: sin pase
                // activo el badge del hero debe desaparecer ya, no cuando
                // aterrice la revalidación.
                setStatus(null);
                dialogRef.current?.close();
                startTransition(() => removeFromLibrary(itemType, itemId));
              }}
              className="flex items-center gap-3 px-5 py-3.5 text-left text-sm font-medium text-status-dropped hover:bg-surface-muted disabled:opacity-60"
            >
              <XIcon aria-hidden className="h-4 w-4" />
              {t("unfollow")}
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
