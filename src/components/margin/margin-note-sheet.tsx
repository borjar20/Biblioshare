"use client";

import { useCallback, useEffect, useId, useRef, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { MarginNoteComposer } from "./margin-note-composer";

type ComposerProps = Omit<ComponentProps<typeof MarginNoteComposer>, "onDone">;

// Hoja modal con el compositor dentro. Mismo primitivo que ClosePassSheet:
// <dialog> nativo + showModal(), que atrapa el foco y cierra con Escape. El
// compositor solo se monta mientras la hoja está abierta, así que cada apertura
// parte limpia y lee el valor ACTUAL de `defaultPage` (en la hoja de sesión, el
// campo vivo de página). El llamante pinta esta hoja FUERA de cualquier <form>.
export function MarginNoteSheet({
  open,
  onClose,
  ...composer
}: ComposerProps & { open: boolean; onClose: () => void }) {
  const t = useTranslations("margin");
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Una hoja por episodio en la misma página: un id fijo se repetiría.
  const titleId = useId();

  // Identidad estable: el compositor la usa como dependencia de su temporizador.
  const closeSheet = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(420px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-2">
        <h2 id={titleId} className="font-serif text-lg font-semibold">
          {t("sheetTitle")}
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={t("close")}
          className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto px-5 py-4">
        {open && <MarginNoteComposer {...composer} onDone={closeSheet} />}
      </div>
    </dialog>
  );
}
