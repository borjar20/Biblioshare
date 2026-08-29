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

// Turnos y estados globales — el ciclo de vida (eliminación/fin) se completa en la Task 6.
function lifecycleReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  switch (event.type) {
    case "turn_passed": {
      if (state.players.every((p) => p.elimination)) throw new PlayEventError("no queda nadie vivo");
      const seats = state.players.length;
      let round = state.round;
      let seat = state.activeSeat;
      // El límite de ronda es la POSICIÓN de asiento del inicial, no la persona:
      // si el inicial está eliminado la ronda sigue avanzando (spec §3).
      for (let i = 1; i <= seats; i++) {
        const candidate = (state.activeSeat + i) % seats;
        if (candidate === state.setup.startingSeat) round += 1;
        if (!state.players[candidate].elimination) {
          seat = candidate;
          break;
        }
      }
      return { ...state, activeSeat: seat, round, turnCount: state.turnCount + 1 };
    }

    case "monarch_changed": {
      const { holder } = event.payload;
      if (holder !== null) seatOf(state, holder);
      return { ...state, monarch: holder };
    }

    case "initiative_changed": {
      const { holder } = event.payload;
      if (holder !== null) seatOf(state, holder);
      return { ...state, initiative: holder };
    }

    default:
      return endgameReducer(state, event);
  }
}

// Eliminación, restauración y finalización — Task 6.
function endgameReducer(state: CommanderState, event: CommanderEvent): CommanderState {
  throw new PlayEventError(`evento desconocido: ${event.type}`);
}
