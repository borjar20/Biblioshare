"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ActivityItem } from "@/lib/clubs/activities/core";
import { spawnLinkedActivity } from "@/lib/clubs/activities/core";
import { itemHref } from "@/lib/catalog/item-href";

// Hoja del frame 14: al tocar un ítem de un reto por lista (siendo curador/mod y con el reto
// activo) se ofrece abrir una lectura conjunta partiendo de ese ítem, o ir a su ficha. La
// acción de lectura conjunta solo aplica a libro/serie (las películas irán aparte).
export function ItemConnectSheet({
  parentActivityId,
  item,
  open,
  onClose,
}: {
  parentActivityId: string;
  item: ActivityItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!item) return <dialog ref={dialogRef} onClose={onClose} className="hidden" />;

  const canBuddyRead = item.itemType === "book" || item.itemType === "series";

  function openBuddyRead() {
    if (!item) return;
    setError(false);
    startTransition(async () => {
      try {
        const childId = await spawnLinkedActivity({
          parentActivityId,
          kind: "buddy_read",
          title: `${t("kind_buddy_read")} · ${item.itemTitle}`,
          fromItemType: item.itemType,
          fromItemId: item.itemId,
        });
        dialogRef.current?.close();
        // Navega al club correcto vía la ruta de actividad; el slug lo resuelve la página.
        router.push(`../actividad/${childId}`);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="item-connect-title"
      className="m-auto mt-auto mb-0 w-full max-w-lg rounded-t-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="h-16 w-11 shrink-0 overflow-hidden rounded-[5px] bg-surface-muted">
            {item.itemCoverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
              <img src={item.itemCoverUrl} alt={item.itemTitle} className="h-full w-full object-cover" />
            )}
          </div>
          <div id="item-connect-title" className="font-serif text-sm font-semibold">
            {item.itemTitle}
          </div>
        </div>

        <h3 className="label-section">
          {t("connectFromItem")}
        </h3>

        {canBuddyRead && (
          <button
            type="button"
            onClick={openBuddyRead}
            disabled={pending}
            className="flex items-center gap-3 rounded-card border border-accent/40 bg-accent/[0.08] px-4 py-3 text-left disabled:opacity-60"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent/15 text-accent">◈</span>
            <span className="flex-1">
              <span className="block font-serif text-sm font-semibold">{t("openBuddyRead")}</span>
              <span className="block text-[11.5px] text-muted-foreground">{t("openBuddyReadHint")}</span>
            </span>
            <span className="text-muted-foreground">›</span>
          </button>
        )}

        <Link
          href={itemHref(item.itemType, item.itemId)}
          // "Ver ficha" navega fuera de la ficha del reto (a /libro|/serie|...).
          // Hay que cerrar el <dialog> A MANO antes de irse: con Cache Components
          // el slot de la ficha se conserva en navegación soft, así que un
          // <dialog> abierto no se desmonta -- al volver queda con dialog.open
          // pero FUERA del top layer (sin backdrop, sin Escape), roto e
          // incerrable (misma clase que session-modal, #448). El close() nativo
          // dispara onClose -> setSheetItem(null); la navegación del Link sigue.
          onClick={() => dialogRef.current?.close()}
          className="flex items-center gap-3 rounded-card border border-border px-4 py-3"
        >
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-surface-muted text-muted-foreground">▤</span>
          <span className="flex-1">
            <span className="block font-serif text-sm font-semibold">{t("viewItemSheet")}</span>
            <span className="block text-[11.5px] text-muted-foreground">{t("viewItemSheetHint")}</span>
          </span>
          <span className="text-muted-foreground">›</span>
        </Link>

        <p className="text-center font-mono text-[9.5px] leading-relaxed text-faint">
          {t("tierlistOfferedAtClose")}
        </p>

        {error && <p className="text-center text-xs text-status-dropped">{t("proposeError")}</p>}
      </div>
    </dialog>
  );
}
