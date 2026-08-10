"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, XIcon } from "@/components/ui/icons";
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
// cerraba el modal. El badge de lápiz es el mismo en plegado y desplegado: la
// pastilla "crece" de prompt a cabecera para que la transición se lea continua.
export function ThoughtComposerInline() {
  const t = useTranslations("thoughtComposer");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-left shadow-card transition-colors hover:border-accent/50 hover:bg-surface-muted"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
          <PencilIcon className="h-[18px] w-[18px]" />
        </span>
        <span className="font-serif text-[15px] text-muted-foreground transition-colors group-hover:text-foreground">
          {t("trigger")}
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label={t("title")}
      className="rounded-card border border-border bg-surface p-4 shadow-card"
    >
      <div className="mb-3.5 flex items-center gap-2.5 border-b border-border pb-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <PencilIcon className="h-4 w-4" />
        </span>
        <b className="min-w-0 flex-1 font-serif text-[16px] font-semibold">{t("title")}</b>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <ThoughtComposer onDone={() => setOpen(false)} />
    </section>
  );
}
