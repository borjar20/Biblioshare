"use client";

import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { TurnPassedEvent } from "@/lib/play/mtg/events";
import type { MtgState } from "@/lib/play/mtg/types";
import { playTools } from "@/lib/play/tools";
import { nextAliveSeat } from "@/lib/play/mtg/rules";
import { GameClock } from "./game-clock";

function turnEvent(): TurnPassedEvent {
  return makeEvent<TurnPassedEvent["type"], TurnPassedEvent["payload"]>("turn_passed", {}, Date.now());
}

/**
 * La consola: deshacer, turno, crono y menú. SIEMPRE es banda con fila propia en la
 * rejilla, también tumbada. La variante flotante (decisión 2026-08-29 (6)) se retiró
 * en la (9): flotaba exactamente sobre la franja central donde todas las cabeceras
 * pegan sus nombres, y los dejaba intocables — sus hojas eran inaccesibles.
 *
 * **Deshacer nunca pierde la etiqueta de QUÉ deshace.** Puede perder la palabra
 * «Deshacer» —la flecha ya lo dice— pero no el «Jugador 1 −1»: sin eso hay que
 * pulsar y mirar, que son dos acciones donde había una.
 */
export function CenterConsole({
  game,
  store,
  onOpenMenu,
}: {
  game: ActiveGame;
  store: PlayStore;
  onOpenMenu: () => void;
}) {
  const t = useTranslations("play");
  const state = game.state as MtgState;

  // El último evento sale del LOG, no del estado derivado: el estado no recuerda qué
  // lo dejó así. `game_started` no es deshacible (lo garantiza `core/log.ts`).
  const last = game.log.pending ?? game.log.committed[game.log.committed.length - 1];
  const undoable = last !== undefined && last.type !== "game_started";
  const described = last ? playTools[state.toolId].describe(last, state) : null;
  const label = described ? t(`log.${described.key}`, described.params) : "";

  const active = state.players[state.activeSeat];
  const nextAlive = state.players[nextAliveSeat(state)];

  return (
    <div className="flex w-full items-center gap-2 rounded-[14px] border border-border bg-surface px-2 py-1">
      <button
        type="button"
        disabled={!undoable}
        onClick={() => store.undo()}
        aria-label={undoable ? t("console.undo", { event: label }) : t("console.nothingToUndo")}
        className="flex min-w-0 max-w-[46%] items-center gap-1.5 rounded-chip px-2 py-1 text-[12px] disabled:opacity-40"
      >
        <span aria-hidden className="shrink-0 text-[13px]">
          ↶
        </span>
        {/* La etiqueta puede quedarse sin la palabra «Deshacer», nunca sin el qué.
            Pero cuando NO hay nada que deshacer, el texto solo roba sitio al nombre
            del turno — en un móvil estrecho lo dejaba en «Juga…» —, así que ahí la
            flecha atenuada basta. */}
        {undoable && <span className="min-w-0 truncate text-muted-foreground">{label}</span>}
      </button>

      <button
        type="button"
        onClick={() => store.dispatch(turnEvent())}
        aria-label={t("console.passTurn", { name: nextAlive.participant.name })}
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-chip bg-surface-muted px-2 py-1"
      >
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("console.turn", { round: state.round })}
        </span>
        <span className="min-w-0 truncate font-serif text-[13px] font-semibold">
          {active.participant.name}
        </span>
        <span aria-hidden className="text-[12px] text-muted-foreground">
          →
        </span>
      </button>

      <GameClock startedAt={state.startedAt} />

      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={t("console.menu")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-chip border border-border text-[13px]"
      >
        •••
      </button>
    </div>
  );
}

