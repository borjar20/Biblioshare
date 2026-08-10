"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon } from "@/components/ui/icons";
import { ThoughtComposer } from "./thought-composer";

// El compositor de «Pensamiento» plegable inline en la columna del feed. Antes
// vivía tras un botón que abría un <dialog> (thought-composer-trigger.tsx,
// retirado): escribir es la acción de cabecera del feed, y un modal la sacaba
// de la columna. Ahora se despliega EN SITIO —misma tarjeta que el resto del
// feed— y se recoge al terminar.
//
// Al plegar, el ThoughtComposer se DESMONTA (no queda oculto): así cada vez que
// se abre arranca limpio, sin que el formulario tenga que resetearse a sí mismo.
// `onDone` (publicar o cancelar) lo pliega; es el mismo callback que antes
// cerraba el modal.
export function ThoughtComposerInline() {
  const t = useTranslations("thoughtComposer");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-card border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-accent"
      >
        <PencilIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-serif text-[15px] text-muted-foreground">{t("trigger")}</span>
      </button>
    );
  }

  return (
    <section
      aria-label={t("title")}
      className="rounded-card border border-border bg-surface p-4 shadow-card"
    >
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <b className="font-serif text-[16px] font-semibold">{t("title")}</b>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <ThoughtComposer onDone={() => setOpen(false)} />
    </section>
  );
}
