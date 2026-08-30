"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import { modeConfig, MTG_MODES, MTG_MODE_IDS, type MtgMode } from "@/lib/play/mtg/modes";
import { rememberTable } from "@/lib/play/ui/table-memory";
import { newDraft, toSetup } from "@/lib/play/ui/setup-draft";
import { buttonVariants } from "@/components/ui/button";

function parseMode(value: string | null): MtgMode {
  return MTG_MODE_IDS.includes(value as MtgMode) ? (value as MtgMode) : "commander";
}

/** Reserva la altura exacta del selector: sin esto, el hub da un salto al hidratar. */
export function MtgModeChooserSkeleton() {
  return <div aria-hidden className="h-[418px]" />;
}

/**
 * Selector de modo + arranque. Lo que de verdad distingue un modo de otro es con
 * cuántas vidas empiezas, así que el número ES la tarjeta. Va en Fraunces, no en la
 * mono del tablero: el hub es un sitio donde se lee y se elige, no un instrumento.
 *
 * **«Jugar ya» es el camino primario** (revisión UX 2026-08-30): modo + cuántos sois
 * y a la mesa, sin pasar por la pantalla de configuración. Configurar nombres y
 * mazos es lo OPCIONAL, y por eso es el enlace secundario — antes era al revés y la
 * configuración parecía un formulario obligatorio que había que dejar en blanco.
 *
 * Necesita `identity` porque arranca la partida él mismo: el store se aísla por
 * identidad para no filtrar la partida entre cuentas del mismo dispositivo (#680).
 *
 * La lista sale de `MTG_MODES`, no de un array a mano: añadir un modo es una fila en
 * esa tabla y esta pantalla no se toca (mientras sus reglas quepan en la tabla — el
 * día que llegue Dos cabezas, que comparte vidas por EQUIPO, eso es motor nuevo).
 */
export function MtgModeChooser({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const router = useRouter();
  // El `?modo=` lo lee la isla y no la página: leerlo en el servidor sacaría la ruta
  // entera del prerender por un parámetro que solo decide qué botón sale marcado.
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<MtgMode>(() => parseMode(searchParams.get("modo")));
  const [players, setPlayers] = useState(4);
  const { snapshot, store } = useActiveGame(identity);

  const config = modeConfig(mode);
  // El estado guarda la ÚLTIMA elección del usuario; el modo la acota. Así cambiar a
  // Duelo (2 exactos) y volver a Commander recupera los 4 sin estado extra.
  const count = Math.min(Math.max(players, config.minPlayers), config.maxPlayers);

  function playNow() {
    // Con el store hidratando no se arranca: podría pisar una activa aún no
    // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
    if (snapshot.status === "loading") return;
    const setup = toSetup(newDraft(mode, count), (i) => t("setup.playerN", { n: i + 1 }));
    // Mismo contrato que «Empezar» en la configuración: arrancar ES pedir sustituir
    // la partida que hubiera (spec §4, una sola activa).
    if (snapshot.game) store.discard();
    if (!store.start(makeEvent("game_started", { toolId: "mtg" as const, setup }, Date.now()))) {
      return;
    }
    rememberTable(identity, setup);
    router.push("/partida/activa");
  }

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

      {/* Cuántos sois. Solo si el modo admite más de uno: en Duelo son exactamente
          dos y un selector de un solo valor es ruido. */}
      {config.minPlayers !== config.maxPlayers && (
        <fieldset>
          <legend className="mb-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {t("setup.players")}
          </legend>
          <div className="flex gap-2">
            {Array.from(
              { length: config.maxPlayers - config.minPlayers + 1 },
              (_, i) => config.minPlayers + i,
            ).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                onClick={() => setPlayers(n)}
                className={`tap-44 h-11 min-w-11 flex-1 rounded-chip border font-mono text-[15px] tabular-nums transition-colors ${
                  count === n
                    ? "border-accent bg-accent/10 text-accent-ink"
                    : "border-border bg-surface"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={playNow}
          disabled={snapshot.status === "loading"}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("tools.mtg.playNow")}
        </button>
        {/* El `?jugadores=` conserva la elección al saltar a configurar: elegir 5 y
            que la configuración abra con 4 sería desdecirse. */}
        <Link
          href={`/partidas/mtg/nueva?modo=${mode}&jugadores=${count}`}
          className={buttonVariants("secondary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("tools.mtg.configure")}
        </Link>
      </div>
    </>
  );
}
