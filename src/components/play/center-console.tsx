"use client";

import { useTranslations } from "next-intl";
import { makeEvent } from "@/lib/play/core/events";
import type { ActiveGame, PlayStore } from "@/lib/play/core/store";
import type { TurnPassedEvent } from "@/lib/play/mtg/events";
import type { MtgState } from "@/lib/play/mtg/types";
import { playTools } from "@/lib/play/tools";
import type { ConsoleMode } from "@/lib/play/ui/layout";
import { GameClock } from "./game-clock";

function turnEvent(): TurnPassedEvent {
  return makeEvent<TurnPassedEvent["type"], TurnPassedEvent["payload"]>("turn_passed", {}, Date.now());
}

/**
 * La consola: deshacer, turno, crono y menú. Dos tratamientos según la orientación,
 * y no es capricho estético sino aritmética (decisión 2026-08-29 (6)):
 *
 * - **De pie** (`band`): banda a todo el ancho entre las dos filas. Quitarla
 *   recuperaba 14 px repartidos entre dos filas y no compensa.
 * - **Tumbado** (`floating`): la banda serían 68 px, el 17 % del alto, y salen
 *   enteros del número de vidas. Ahí la consola sale del hueco y flota en el centro
 *   sobre paneles a pantalla completa — el hueco ya lo reservan las cabeceras con
 *   su padding, no se supone vacío.
 *
 * **Deshacer nunca pierde la etiqueta de QUÉ deshace.** Puede perder la palabra
 * «Deshacer» —la flecha ya lo dice— pero no el «Jugador 1 −1»: sin eso hay que
 * pulsar y mirar, que son dos acciones donde había una.
 */
export function CenterConsole({
  game,
  store,
  mode,
  onOpenMenu,
}: {
  game: ActiveGame;
  store: PlayStore;
  mode: ConsoleMode;
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
  const nextAlive = nextSeat(state);

  return (
    <div
      className={`flex items-center gap-2 rounded-[14px] border border-border bg-surface px-2 py-1.5 ${
        mode === "floating"
          ? "pointer-events-auto absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 shadow-lg"
          : "w-full"
      }`}
    >
      <button
        type="button"
        disabled={!undoable}
        onClick={() => store.undo()}
        aria-label={undoable ? t("console.undo", { event: label }) : t("console.nothingToUndo")}
        className="flex min-w-0 max-w-[46%] items-center gap-1.5 rounded-chip px-2 py-1.5 text-[12px] disabled:opacity-40"
      >
        <span aria-hidden className="shrink-0 text-[13px]">
          ↶
        </span>
        {/* La etiqueta puede quedarse sin la palabra «Deshacer», nunca sin el qué. */}
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      </button>

      <button
        type="button"
        onClick={() => store.dispatch(turnEvent())}
        aria-label={t("console.passTurn", { name: nextAlive.participant.name })}
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-chip bg-surface-muted px-2 py-1.5"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
        className="grid h-9 w-9 shrink-0 place-items-center rounded-chip border border-border text-[13px]"
      >
        •••
      </button>
    </div>
  );
}

/** A quién le tocaría: mismo salto de eliminados que hace el reducer. */
function nextSeat(state: MtgState) {
  const seats = state.players.length;
  for (let i = 1; i <= seats; i++) {
    const candidate = state.players[(state.activeSeat + i) % seats];
    if (!candidate.elimination) return candidate;
  }
  return state.players[state.activeSeat];
}
