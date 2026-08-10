"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ThoughtComposer } from "./thought-composer";

// El compositor de «Pensamiento» desplegado en la columna del feed. Antes vivía
// tras un botón que abría un <dialog> (thought-composer-trigger.tsx, retirado):
// escribir un pensamiento es la acción de cabecera del feed, esconderla tras un
// botón + modal la penalizaba. Va inline y a ancho completo de su columna, con
// el mismo chasis de tarjeta que el resto del feed (rounded-card / border /
// bg-surface / shadow-card).
//
// `key={round}` remonta el ThoughtComposer al terminar (publicar o cancelar):
// así vuelve limpio sin que el formulario tenga que saber resetearse a sí mismo
// -- el mismo `onDone` que antes cerraba el modal.
export function ThoughtComposerInline() {
  const t = useTranslations("thoughtComposer");
  const [round, setRound] = useState(0);

  return (
    <section
      aria-label={t("trigger")}
      className="rounded-card border border-border bg-surface p-4 shadow-card"
    >
      <b className="mb-3 block font-serif text-[16px] font-semibold">{t("trigger")}</b>
      <ThoughtComposer key={round} onDone={() => setRound((n) => n + 1)} />
    </section>
  );
}
