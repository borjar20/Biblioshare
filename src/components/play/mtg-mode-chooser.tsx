"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MTG_MODES, MTG_MODE_IDS, type MtgMode } from "@/lib/play/mtg/modes";
import { buttonVariants } from "@/components/ui/button";

function parseMode(value: string | null): MtgMode {
  return MTG_MODE_IDS.includes(value as MtgMode) ? (value as MtgMode) : "commander";
}

/** Reserva la altura exacta del selector: sin esto, el hub da un salto al hidratar. */
export function MtgModeChooserSkeleton() {
  return <div aria-hidden className="h-[232px]" />;
}

/**
 * Selector de modo + CTA. Lo que de verdad distingue un modo de otro es con cuántas
 * vidas empiezas, así que el número ES la tarjeta. Va en Fraunces, no en la mono del
 * tablero: el hub es un sitio donde se lee y se elige, no un instrumento.
 *
 * Se elige el modo y se empieza: dos toques.
 *
 * La lista sale de `MTG_MODES`, no de un array a mano: añadir un modo es una fila en
 * esa tabla y esta pantalla no se toca (mientras sus reglas quepan en la tabla — el
 * día que llegue Dos cabezas, que comparte vidas por EQUIPO, eso es motor nuevo).
 */
export function MtgModeChooser() {
  const t = useTranslations("play");
  // El `?modo=` lo lee la isla y no la página: leerlo en el servidor sacaría la ruta
  // entera del prerender por un parámetro que solo decide qué botón sale marcado.
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<MtgMode>(() => parseMode(searchParams.get("modo")));

  return (
    <>
      <section>
        <h2 className="mb-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("tools.mtg.modesTitle")}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {MTG_MODE_IDS.map((id) => {
            const selected = id === mode;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-1 rounded-card border p-4 text-center transition-colors ${
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-surface hover:bg-surface-muted"
                }`}
              >
                <span className="font-serif text-[34px] font-semibold leading-none">
                  {MTG_MODES[id].startingLife}
                </span>
                <span className="mt-1 font-serif text-[15px] font-semibold">
                  {t(`tools.mtg.modes.${id}.name`)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t(`tools.mtg.modes.${id}.detail`)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Una tarjeta genérica, no una lista de deudas: enseña que esto crece por
            modos sin fingir que están a un clic ni prometer fechas. */}
        <div className="mt-3 rounded-card border border-dashed border-border px-4 py-3 opacity-55">
          <p className="font-serif text-[14px] font-semibold">{t("tools.mtg.moreModes")}</p>
          <p className="text-[11px] text-muted-foreground">{t("tools.mtg.moreModesDetail")}</p>
        </div>
      </section>

      <Link
        href={`/partidas/mtg/nueva?modo=${mode}`}
        className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
      >
        {t("tools.mtg.newGame", { mode: t(`tools.mtg.modes.${mode}.name`) })}
      </Link>
    </>
  );
}
