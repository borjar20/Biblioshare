"use client";

import { useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { updateStatus } from "@/lib/library/manage-actions";
import { useItemStatus } from "@/components/detail/item-status-context";
import { Button } from "@/components/ui/button";

// Al retomar un abandonado hay dos historias posibles: seguir el intento
// anterior (mismo pase, cursor y sesiones intactos) o empezar de cero (pase
// nuevo; el abandonado queda archivado en el diario). La máquina no decide
// sola: pregunta (planTransition devuelve askResume) y esta hoja responde.
//
// Mismo <dialog> nativo que close-pass-sheet.tsx (misma razón: atrapa foco y
// cierra con Escape sin código propio; el evento "close" es la única vía por
// la que avisamos al padre, tanto si el usuario elige una opción como si
// cierra sin elegir — el padre no necesita distinguirlo, solo refrescar).
export function ResumePassSheet({
  itemType,
  itemId,
  droppedAtLabel,
  open,
  onClose,
}: {
  itemType: ItemType;
  itemId: string;
  droppedAtLabel: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("passes.resume");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const { setStatus } = useItemStatus();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function pick(resume: "continue" | "restart") {
    // Elegir cualquiera de las dos opciones acaba en "in_progress": badge y
    // pills lo enseñan ya. Cancelar no pasa por aquí — el estado se quedó en
    // el revert que hizo ManagedLog al recibir askResume.
    setStatus("in_progress");
    startTransition(async () => {
      // Este updateStatus siempre resuelve a un pase abierto (to ===
      // "in_progress" con resume ya decidido): nunca puede volver a pedir
      // askResume ni encadenar la hoja de cierre, así que no hace falta
      // mirar el outcome aquí — basta con cerrar y dejar que el padre
      // refresque.
      await updateStatus(itemType, itemId, "in_progress", resume);
      dialogRef.current?.close();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="resume-pass-title"
      className="m-auto w-[min(420px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        // Clic en el propio <dialog> (fuera del contenido) = clic en el
        // fondo: mismo gesto de cierre que Escape.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex flex-col">
        <div className="border-b border-border px-5 py-4">
          <h2
            id="resume-pass-title"
            className="font-serif text-lg font-semibold"
          >
            {t("title")}
          </h2>
          {droppedAtLabel && (
            <p className="mt-1 text-sm text-muted-foreground">
              {droppedAtLabel}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4">
          <Button
            type="button"
            disabled={pending}
            onClick={() => pick("continue")}
          >
            {t("continue")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => pick("restart")}
          >
            {t("restart")}
          </Button>
        </div>

        <div className="border-t border-border px-5 py-4">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="w-full"
            onClick={() => dialogRef.current?.close()}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
