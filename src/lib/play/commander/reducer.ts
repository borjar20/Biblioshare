import { PlayEventError } from "@/lib/play/core/errors";
import type { CommanderPlayerState, CommanderState } from "./types";
import type { CommanderEvent, GameStartedEvent } from "./events";

export function initialCommanderState(event: GameStartedEvent): CommanderState {
  const { setup } = event.payload;
  const n = setup.participants.length;
  if (n < 2 || n > 6) throw new PlayEventError(`Commander admite 2-6 jugadores, no ${n}`);
  const ids = new Set(setup.participants.map((p) => p.id));
  if (ids.size !== n) throw new PlayEventError("ids de participante duplicados");
  if (setup.startingSeat < 0 || setup.startingSeat >= n) throw new PlayEventError("startingSeat fuera de rango");
  return {
    toolId: "commander",
    status: "active",
    setup,
    players: setup.participants.map((participant) => ({
      participant,
      life: setup.startingLife,
      poison: 0,
      commanderDamage: {},
      elimination: null,
    })),
    activeSeat: setup.startingSeat,
    round: 1,
    turnCount: 0,
    monarch: null,
    initiative: null,
    eliminationCounter: 0,
    winner: null,
    finishReason: null,
    startedAt: event.at,
    finishedAt: null,
  };
}

function seatOf(state: CommanderState, id: string): number {
  const i = state.players.findIndex((p) => p.participant.id === id);
  if (i < 0) throw new PlayEventError(`participante desconocido: ${id}`);
  return i;
}

function withPlayer(
  state: CommanderState,
  id: string,
  fn: (p: CommanderPlayerState) => CommanderPlayerState,
): CommanderState {
  const i = seatOf(state, id);
  const players = state.players.slice();
  players[i] = fn(players[i]);
  return { ...state, players };
}

export function commanderReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  // Rechazar es lo que hace fiable la validación por replay al rehidratar (spec §4).
  if (state.status === "finished") throw new PlayEventError(`evento tras game_finished: ${event.type}`);

  switch (event.type) {
    case "game_started":
      throw new PlayEventError("game_started solo puede ser el primer evento");

    case "life_changed": {
      const { target, delta } = event.payload;
      return withPlayer(state, target, (p) => ({ ...p, life: p.life + delta }));
    }

    case "commander_damage": {
      const { source, target, delta } = event.payload;
      seatOf(state, source); // valida que el atacante exista
      // Un solo evento semántico toca vidas Y daño de comandante: nunca se pide
      // al usuario mantener dos contadores a mano (issue #931).
      return withPlayer(state, target, (p) => ({
        ...p,
        life: p.life - delta,
        commanderDamage: { ...p.commanderDamage, [source]: (p.commanderDamage[source] ?? 0) + delta },
      }));
    }

    case "poison_changed": {
      const { target, delta } = event.payload;
      return withPlayer(state, target, (p) => ({ ...p, poison: Math.max(0, p.poison + delta) }));
    }

    default:
      return lifecycleReducer(state, event);
  }
}

// Turnos, estados globales y ciclo de vida — se completa en las Tasks 5 y 6.
function lifecycleReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  throw new PlayEventError(`evento desconocido: ${event.type}`);
}
