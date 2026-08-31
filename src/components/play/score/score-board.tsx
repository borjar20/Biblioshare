"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { GameFinishedEvent } from "@/lib/play/score/events";
import type { ScoreState } from "@/lib/play/score/types";
import { limitReached, totals } from "@/lib/play/score/selectors";
import { playTools } from "@/lib/play/tools";
import { seatAccent } from "@/lib/play/ui/seats";
import { DEFAULT_PREFERENCES, preferencesStore } from "@/lib/play/ui/preferences";
import { buttonVariants } from "@/components/ui/button";
import { GameClock } from "../game-clock";
import { useWakeLock } from "../use-wake-lock";
import { RoundSheet } from "./round-sheet";
import { ScoreChart } from "./score-chart";
import { ScoreGameSheet } from "./score-game-sheet";

const getServerPreferences = () => DEFAULT_PREFERENCES;

/**
 * El tablero de puntuación. A diferencia de `game-board.tsx`, es una TABLA, no una
 * mesa: portrait fijo, sin rotaciones ni rejilla de asientos — el móvil se mira de
 * pie y la tabla entera cabe scrolleando hacia los lados (`overflow-x-auto`).
 *
 * Deshacer vive en la hoja de partida (`ScoreGameSheet`), no en el tablero: mismo
 * reparto que mtg tras la decisión (9) — la consola flotante se retiró y sus
 * acciones fueron a la hoja.
 */
export function ScoreBoard({
  game,
  store,
}: {
  game: ActiveGame;
  store: PlayStore;
  identity: string;
}) {
  const t = useTranslations("play");
  const state = game.state as ScoreState;
  // "closed": nada abierto. "new": alta de ronda. un número: edición de esa ronda.
  const [sheetRound, setSheetRound] = useState<"closed" | "new" | number>("closed");
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prefs = useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    getServerPreferences,
  );
  useWakeLock(prefs.keepAwake);

  const sums = totals(state);
  const finishable = limitReached(state);

  // Al apuntar, la ronda nueva entra en pantalla: el contenedor se desplaza a
  // su borde derecho, donde queda la última ronda (TOTAL sigue fijo, sticky-right).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth });
  }, [state.rounds.length]);

  // Igual que game-board.tsx: una única región que anuncia el último movimiento.
  const lastEvent = game.log.pending ?? game.log.committed[game.log.committed.length - 1];
  const described = lastEvent ? playTools[state.toolId].describe(lastEvent, state) : null;

  function finish() {
    store.dispatch(
      makeEvent<GameFinishedEvent["type"], GameFinishedEvent["payload"]>(
        "game_finished",
        { reason: "manual" },
        Date.now(),
      ),
    );
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-play-felt p-2">
      <header className="flex items-center gap-2 rounded-[14px] border border-border bg-surface px-3 py-2">
        <b className="min-w-0 flex-1 truncate font-serif text-[15px] font-semibold">
          {state.setup.gameName ?? t("tools.score.name")}
        </b>
        <GameClock startedAt={state.startedAt} />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("console.menu")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-chip border border-border text-[13px]"
        >
          •••
        </button>
      </header>

      {/* Banda NO bloqueante: el límite es informativo, la partida sigue editable
          aunque se muestre (spec §2/§4 de score). */}
      {finishable && (
        <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-border bg-surface-muted px-3 py-2">
          <p className="min-w-0 flex-1 text-[13px]">{t("scoreBoard.limitReached")}</p>
          <button
            type="button"
            onClick={finish}
            className={buttonVariants("secondary", "shrink-0 px-3 py-1.5 text-[13px]")}
          >
            {t("scoreBoard.finish")}
          </button>
        </div>
      )}

      {/* La tabla ya no acapara todo el alto (era todo hueco vacío bajo dos
          filas): crece con sus jugadores hasta la mitad de la pantalla y el
          resto es del gráfico de evolución. */}
      <div
        ref={scrollRef}
        className="mt-2 max-h-[50dvh] shrink-0 overflow-x-auto overflow-y-auto rounded-[14px] border border-border bg-surface"
      >
        <table className="w-full min-w-max border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {t("scoreBoard.player")}
              </th>
              {state.rounds.map((_, round) => (
                <th
                  key={round}
                  className="px-2.5 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground"
                >
                  {t("scoreBoard.round", { round: round + 1 })}
                </th>
              ))}
              {/* TOTAL siempre visible: sticky-right con el mismo tratamiento
                  que la columna de jugador (fondo propio para que las rondas
                  no se transparenten al hacer scroll por debajo). */}
              <th className="sticky right-0 z-10 bg-surface px-3 py-2 text-right font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {t("scoreBoard.total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {state.setup.participants.map((participant, seat) => (
              <tr key={participant.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`${seatAccent(seat).bar} h-5 w-1 shrink-0 rounded-full`}
                    />
                    <span className="min-w-0 truncate">{participant.name}</span>
                  </div>
                </td>
                {state.rounds.map((round, index) => (
                  <td key={index} className="px-2.5 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setSheetRound(index)}
                      aria-label={t("roundSheet.edit", { round: index + 1 })}
                      className="tabular-nums underline-offset-2 hover:underline"
                    >
                      {round[seat]}
                    </button>
                  </td>
                ))}
                <td className="sticky right-0 z-10 bg-surface px-3 py-2 text-right font-semibold tabular-nums">
                  {sums[seat]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-2 flex min-h-0 flex-1 flex-col rounded-[14px] border border-border bg-surface p-3">
        <h2 className="mb-2 shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("scoreBoard.chartTitle")}
        </h2>
        <div className="min-h-0 flex-1">
          <ScoreChart state={state} />
        </div>
      </section>

      <button
        type="button"
        onClick={() => setSheetRound("new")}
        className={buttonVariants("primary", "mt-2 w-full justify-center py-3 text-[15px]")}
      >
        {t("scoreBoard.addRound")}
      </button>

      <p aria-live="polite" className="sr-only">
        {described ? t(`log.${described.key}`, described.params) : ""}
      </p>

      {sheetRound !== "closed" && (
        <RoundSheet
          state={state}
          store={store}
          round={sheetRound === "new" ? null : sheetRound}
          onClose={() => setSheetRound("closed")}
        />
      )}
      {menuOpen && <ScoreGameSheet game={game} store={store} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}
