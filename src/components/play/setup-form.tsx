"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import { useActiveGame } from "@/lib/play/core/use-active-game";
import { modeConfig, MTG_MODE_IDS, type MtgMode } from "@/lib/play/mtg/modes";
import { rememberTable, rotateStartingSeat } from "@/lib/play/ui/table-memory";
import { CARD_BACKGROUND_IDS, seatAccent } from "@/lib/play/ui/seats";
import {
  addCommander,
  draftFromSetup,
  newDraft,
  removeCommander,
  setPlayerCount,
  toSetup,
  updateCommander,
  updatePlayer,
  type SetupDraft,
} from "@/lib/play/ui/setup-draft";
import { buttonVariants } from "@/components/ui/button";
import { useRememberedTable } from "./use-remembered-table";

const FIELD =
  "w-full rounded-chip border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground";

function parseMode(value: string | null): MtgMode {
  return MTG_MODE_IDS.includes(value as MtgMode) ? (value as MtgMode) : "commander";
}

/**
 * Configuración de partida. Tres cosas la gobiernan:
 *
 * 1. **Configurar es OPCIONAL, y el orden de la pantalla lo dice.** «Empezar» va
 *    arriba, activo desde el primer píxel; nombres y mazos viven plegados debajo.
 *    Antes el botón quedaba bajo cuatro tarjetas de campos y la pantalla entera se
 *    leía como un formulario que rellenar (revisión UX 2026-08-30) — el aviso de
 *    «puedes empezar sin escribir nada» estaba DESPUÉS del botón que justificaba.
 * 2. **La fricción está en la segunda partida.** Por eso «Revancha» trae la mesa
 *    entera puesta y pasa por AQUÍ en vez de arrancar sola: entre dos partidas casi
 *    siempre cambia algo, y corregirlo con la partida ya empezada es peor. En
 *    revancha la mesa abre DESPLEGADA: se viene justo a mirar los nombres.
 * 3. El color de asiento se reparte aquí para que el salto al tablero no sorprenda:
 *    el que era ciruela en la lista es ciruela en la mesa. Y el orden de esta lista
 *    ES el orden de turnos.
 */
export function SetupForm({ identity }: { identity: string }) {
  const t = useTranslations("play");
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("modo"));
  const isRematch = searchParams.get("revancha") === "1";
  // `?jugadores=` conserva la elección hecha en el hub: elegir 5 allí y abrir esto
  // con 4 sería desdecirse. `newDraft` acota el número a lo que el modo admite.
  // Sin parámetro tiene que quedar `undefined`, no `Number(null) === 0`: un 0 se
  // acotaría al mínimo del modo y abriría la mesa con 2 en vez de con 4.
  const rawPlayers = searchParams.get("jugadores");
  const requestedPlayers = rawPlayers === null ? undefined : Number(rawPlayers);
  const config = modeConfig(mode);

  const remembered = useRememberedTable(identity);
  const { snapshot, store } = useActiveGame(identity);

  // La mesa recordada llega DESPUÉS de hidratar (vive en localStorage), así que no
  // se puede sembrar el `useState` con ella. En vez de sincronizar con un efecto
  // —prohibido por lint y con un primer render equivocado—, el borrador se DERIVA
  // mientras nadie ha tocado nada, y el estado toma el mando en la primera edición.
  const base = useMemo<SetupDraft>(() => {
    if (isRematch && remembered && remembered.mode === mode) {
      return draftFromSetup(rotateStartingSeat(remembered));
    }
    return newDraft(
      mode,
      requestedPlayers !== undefined && Number.isInteger(requestedPlayers)
        ? requestedPlayers
        : undefined,
    );
  }, [isRematch, remembered, mode, requestedPlayers]);

  const [edited, setEdited] = useState<SetupDraft | null>(null);
  const draft = edited ?? base;

  const seatName = (index: number) =>
    draft.players[index].name.trim() || t("setup.playerN", { n: index + 1 });

  function start() {
    // Con el store hidratando no se arranca: podría pisar una activa aún no
    // leída (spec fase 3 §3). El botón va deshabilitado; esto es el cinturón.
    if (snapshot.status === "loading") return;
    const setup = toSetup(draft, (i) => t("setup.playerN", { n: i + 1 }));
    // Una sola partida activa (spec §4): `start()` LANZA si ya hay una, así que la
    // vieja se descarta aquí — pulsar «Empezar» ES pedir sustituirla, y es lo que
    // hace que la revancha no borre nada hasta que la siguiente arranca de verdad.
    if (snapshot.game) store.discard();
    if (!store.start(makeEvent("game_started", { toolId: "mtg" as const, setup }, Date.now()))) {
      return; // setup que el motor rechaza: no se navega a un tablero que no existe
    }
    // La mesa se recuerda AL EMPEZAR, no al terminar: así sobrevive a descartar.
    rememberTable(identity, setup);
    router.push("/partida/activa");
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-serif text-[24px] font-semibold">{t("setup.title")}</h1>
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("setup.modeAndLife", {
            mode: t(`tools.mtg.modes.${mode}.name`),
            life: draft.startingLife,
          })}
        </p>
      </header>

      {/* Número de jugadores. Solo sale si el modo admite más de uno: en Duelo son
          exactamente dos y un selector de un solo valor es ruido. */}
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
                aria-pressed={draft.players.length === n}
                onClick={() => setEdited(setPlayerCount(draft, n))}
                className={`tap-44 h-11 min-w-11 flex-1 rounded-chip border font-mono text-[15px] tabular-nums transition-colors ${
                  draft.players.length === n
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

      {/* El botón ANTES que los campos: empezar no exige leerlos, y el pie que lo
          dice va pegado al botón, no perdido al final de la página. */}
      <div>
        <button
          type="button"
          onClick={start}
          disabled={snapshot.status === "loading"}
          className={buttonVariants("primary", "w-full justify-center py-3 text-[15px]")}
        >
          {t("setup.start")}
        </button>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {isRematch && remembered
            ? t("setup.rematchSeat", { name: seatName(draft.startingSeat) })
            : t("setup.emptyIsFine")}
        </p>
      </div>

      {/* La mesa, plegada: es la parte opcional. En revancha abre desplegada porque
          a esta pantalla se viene justo a repasar quién sigue sentado. El summary
          enseña los nombres para decidir si hace falta abrir. */}
      <details
        open={isRematch}
        className="rounded-card border border-border bg-surface px-3 py-2.5"
      >
        <summary className="cursor-pointer text-[13px] font-semibold">
          {t("setup.table")}{" "}
          <span className="font-normal text-muted-foreground">
            · {draft.players.map((_, i) => seatName(i)).join(", ")}
          </span>
        </summary>

        <ul className="mt-3 flex flex-col gap-2">
          {draft.players.map((player, i) => {
            const accent = seatAccent(i);
            return (
              <li
                key={player.id}
                className="flex gap-3 overflow-hidden rounded-card border border-border bg-surface"
              >
                {/* La barra del asiento, con su color: el que era ciruela aquí lo es
                    también en la mesa. */}
                <span aria-hidden className={`${accent.bar} w-1.5 shrink-0`} />

                <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-2.5 pr-3">
                  <input
                    value={player.name}
                    onChange={(e) => setEdited(updatePlayer(draft, i, { name: e.target.value }))}
                    placeholder={t("setup.playerN", { n: i + 1 })}
                    aria-label={t("setup.name")}
                    className={`${FIELD} font-serif text-[15px] font-semibold`}
                  />

                  <div className="flex gap-1.5">
                    <input
                      value={player.deckName}
                      onChange={(e) =>
                        setEdited(updatePlayer(draft, i, { deckName: e.target.value }))
                      }
                      placeholder={t("setup.noDeck")}
                      aria-label={t("setup.deck")}
                      className={FIELD}
                    />
                  </div>

                  {/* Partner sin campo nuevo: el comandante es una LISTA de uno o
                      dos. Para el motor son dos comandantes con su propio contador
                      de 21, así que el mismo hueco sirve para partner, background y
                      companion sin inventar tres conceptos. */}
                  {player.commanders.map((commander, j) => (
                    <div key={commander.id} className="flex gap-1.5">
                      <input
                        value={commander.name}
                        onChange={(e) => setEdited(updateCommander(draft, i, j, e.target.value))}
                        placeholder={t("setup.noCommander")}
                        aria-label={t("setup.commanderN", { n: j + 1 })}
                        className={FIELD}
                      />
                      {player.commanders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEdited(removeCommander(draft, i, j))}
                          aria-label={t("setup.removeCommander")}
                          className="tap-44 h-8 w-8 shrink-0 rounded-chip border border-border text-[13px] text-muted-foreground"
                        >
                          −
                        </button>
                      )}
                    </div>
                  ))}

                  {/* El fondo de la tarjeta se elige AQUÍ y no en la partida: viaja
                      dentro de `game_started` y no hay evento que lo cambie después
                      (#943). Es una referencia —un id de tinte—, nunca bytes: un
                      data-URI acabaría en el log y en el snapshot (#942). */}
                  <div className="flex gap-1.5 pt-0.5">
                    {CARD_BACKGROUND_IDS.map((id, tint) => {
                      const chosen = (player.cardBackground ?? `seat-${i + 1}`) === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEdited(updatePlayer(draft, i, { cardBackground: id }))}
                          aria-label={t("setup.background")}
                          aria-pressed={chosen}
                          className={`h-6 w-6 rounded-chip ${seatAccent(tint).tint} ${
                            chosen ? `ring-2 ${seatAccent(tint).ring}` : ""
                          }`}
                        />
                      );
                    })}
                  </div>

                  {player.commanders.length < config.maxCommanders && (
                    <button
                      type="button"
                      onClick={() => setEdited(addCommander(draft, i))}
                      className="self-start font-mono text-[10px] uppercase tracking-widest text-accent-ink"
                    >
                      + {t("setup.addCommander")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </details>

      {/* Lo avanzado, plegado pero enseñando su estado: es lo único que hace falta
          saber para decidir si abrirlo. */}
      <details className="rounded-card border border-border bg-surface px-3 py-2.5">
        <summary className="cursor-pointer text-[13px] font-semibold">
          {t("setup.advanced")}{" "}
          <span className="font-normal text-muted-foreground">
            · {t("setup.advancedSummary", {
              life: draft.startingLife,
              name: seatName(draft.startingSeat),
            })}
          </span>
        </summary>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-[13px]">
            {t("setup.startingLife")}
            <input
              type="number"
              inputMode="numeric"
              value={draft.startingLife}
              onChange={(e) =>
                setEdited({ ...draft, startingLife: Number(e.target.value) || 0 })
              }
              className={`${FIELD} w-24 text-right font-mono tabular-nums`}
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-[13px]">
            {t("setup.startingSeat")}
            <select
              value={draft.startingSeat}
              onChange={(e) => setEdited({ ...draft, startingSeat: Number(e.target.value) })}
              className={`${FIELD} w-40`}
            >
              {draft.players.map((player, i) => (
                <option key={player.id} value={i}>
                  {seatName(i)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </div>
  );
}
