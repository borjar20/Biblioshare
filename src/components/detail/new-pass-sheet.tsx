"use client";

import { useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { updateStatus } from "@/lib/library/manage-actions";
import { useItemStatus } from "@/components/detail/item-status-context";
import { Button } from "@/components/ui/button";

// "Nuevo pase" sobre un pase TODAVÍA ABIERTO (leyendo/viendo): antes de
// empezar de cero hay que saber cómo termina el que se deja atrás, porque el
// diario no puede archivar un pase "a medias sin más" — o se completó, o se
// abandonó. Esta hoja es esa pregunta.
//
// Con el pase ya cerrado (completado/abandonado) NO se pregunta nada: el
// botón archiva y crea directamente, que es lo que hoy hace marcar "Leyendo"
// sobre un completado.
//
// Los dos botones reutilizan el vocabulario de las pastillas de estado
// (StatusSegments) a propósito: es el mismo gesto que el usuario ya conoce —
// "Leído"/"Vista" y "Abandonado" —, no un vocabulario paralelo.
//
// Mismo <dialog> nativo que resume-pass-sheet.tsx / close-pass-sheet.tsx
// (atrapa el foco y cierra con Escape sin código propio; el evento "close" es
// la única vía por la que avisamos al padre, elija o cancele).
export function NewPassSheet({
  itemType,
  itemId,
  open,
  onClose,
}: {
  itemType: ItemType;
  itemId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("passes.newPassSheet");
  const tSegments = useTranslations("detail.statusSegments");
  const tLibrary = useTranslations("library");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const { setStatus } = useItemStatus();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Dos transiciones encadenadas, las dos por la máquina de siempre
  // (planTransition), sin inventar un tipo nuevo:
  //
  //   1. cerrar: abierto → completed|dropped   ⇒ updateActive (finished_on)
  //   2. abrir:  cerrado → in_progress + restart ⇒ archiveAndCreate
  //
  // El `restart` del paso 2 no es decorativo: sin él, cerrar como "abandonado"
  // haría que la máquina devolviera askResume ("¿continuar o de cero?") — y
  // "Nuevo pase" YA es la respuesta "de cero", así que preguntarlo otra vez
  // sería preguntar dos veces lo mismo.
  //
  // No es atómico, y no pasa nada: si el paso 2 fallara, queda un pase cerrado
  // — un estado legítimo que el usuario acaba de pedir, no uno corrupto.
  function pick(closeAs: "completed" | "dropped") {
    // Se acaba leyendo/viendo en los dos casos: el badge del hero y las
    // pastillas lo enseñan ya, sin esperar a la revalidación.
    setStatus("in_progress");
    startTransition(async () => {
      await updateStatus(itemType, itemId, closeAs);
      await updateStatus(itemType, itemId, "in_progress", "restart");
      dialogRef.current?.close();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="new-pass-title"
      className="m-auto w-[min(420px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        // Clic en el propio <dialog> (fuera del contenido) = clic en el
        // fondo: mismo gesto de cierre que Escape.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex flex-col">
        <div className="border-b border-border px-5 py-4">
          <h2 id="new-pass-title" className="font-serif text-lg font-semibold">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
        </div>

        <div className="flex flex-col gap-2.5 px-5 py-4">
          <Button
            type="button"
            disabled={pending}
            onClick={() => pick("completed")}
          >
            {tSegments(`completed.${itemType}`)}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => pick("dropped")}
          >
            {tLibrary("status.dropped")}
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
