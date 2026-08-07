"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ThoughtComposer } from "./thought-composer";

// Botón que abre el compositor de «Pensamiento» en hoja/modal (Fase 4, Task
// 4.3). `<dialog>` nativo con `showModal()`, mismo chasis que el resto del
// repo (src/components/saga/sheet-shell.tsx, sequence/anchor-picker.tsx,
// library/collection-menu.tsx): trae gratis el cierre con Escape, la trampa
// de foco y el `inert` del fondo -- reimplementarlo con un div superpuesto
// perdería las tres cosas. Pegada abajo en móvil, modal centrado en `lg`
// (mismo breakpoint que el resto de hojas).
export function ThoughtComposerTrigger() {
  const t = useTranslations("thoughtComposer");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t("trigger")}
      </Button>
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          aria-label={t("title")}
          onClick={(e) => {
            if (e.target === ref.current) ref.current?.close();
          }}
          className="m-auto mb-0 mt-auto w-full max-w-lg rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim lg:mb-auto lg:rounded-2xl"
        >
          <div className="px-4 pb-5 pt-3.5">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-surface-3 lg:hidden" aria-hidden />
            <div className="mb-3.5 flex items-baseline gap-2.5">
              <b className="min-w-0 flex-1 truncate font-serif text-[16px] font-semibold">
                {t("title")}
              </b>
              <button
                type="button"
                onClick={() => ref.current?.close()}
                aria-label={t("close")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border"
              >
                ✕
              </button>
            </div>
            <ThoughtComposer onDone={() => ref.current?.close()} />
          </div>
        </dialog>
      )}
    </>
  );
}
