import type { PlayEvent } from "@/lib/play/core/types";
import { TURNS_EVENT_TYPES, type TurnsEvent } from "./events";
import { aliveCount, nextAlive } from "./selectors";
import { initialTurnsState, type TurnsState } from "./types";

// Reducer PURO del tracker (spec turnos §1): valida y lanza ante payload
// inválido. La ronda sube AL ENVOLVER: con dir 1, cuando el índice nuevo es
// ≤ que el viejo entre vivos; con dir −1, simétrico.

export const TURNS_MAX_PLAYERS = 8;
export const TURNS_MAX_PHASES = 6;

function assertNames(names: readonly string[], min: number, max: number, what: string): void {
  if (names.length < min || names.length > max) {
    throw new Error(`${what} fuera de ${min}..${max}`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error(`${what}: vacío o sin recortar`);
    if (seen.has(name)) throw new Error(`${what}: duplicado`);
    seen.add(name);
  }
}

function requireStarted(s: TurnsState): number {
  if (s.active === null) throw new Error("sin configurar");
  return s.active;
}

function advanceOnce(s: TurnsState): TurnsState {
  const active = requireStarted(s);
  if (aliveCount(s) < 2) throw new Error("hacen falta 2 vivos");
  const next = nextAlive(s, active, s.direction);
  const wrapped = s.direction === 1 ? next <= active : next >= active;
  return { ...s, active: next, phase: 0, round: s.round + (wrapped ? 1 : 0) };
}

export function turnsReducer(state: TurnsState, event: TurnsEvent): TurnsState {
  switch (event.type) {
    case "turns_configured": {
      const { players, phases } = event.payload;
      assertNames(players, 2, TURNS_MAX_PLAYERS, "jugadores");
      assertNames(phases, 0, TURNS_MAX_PHASES, "fases");
      return {
        players: [...players],
        eliminated: [],
        phases: [...phases],
        active: 0,
        phase: 0,
        round: 1,
        direction: 1,
      };
    }
    case "turn_advanced":
      return advanceOnce(state);
    case "phase_advanced": {
      requireStarted(state);
      if (state.phases.length === 0) throw new Error("sin fases");
      if (state.phase >= state.phases.length - 1) throw new Error("ya en la última fase");
      return { ...state, phase: state.phase + 1 };
    }
    case "turn_skipped":
      return advanceOnce(advanceOnce(state));
    case "direction_toggled": {
      requireStarted(state);
      return { ...state, direction: state.direction === 1 ? -1 : 1 };
    }
    case "player_eliminated": {
      const active = requireStarted(state);
      const { name } = event.payload;
      if (!state.players.includes(name)) throw new Error("jugador inexistente");
      if (state.eliminated.includes(name)) throw new Error("ya eliminado");
      if (aliveCount(state) - 1 < 2) throw new Error("no pueden quedar menos de 2 vivos");
      // Si cae el activo, el turno pasa ANTES de marcarlo (spec §1).
      const s = state.players[active] === name ? advanceOnce(state) : state;
      return { ...s, eliminated: [...s.eliminated, name] };
    }
    case "player_restored": {
      requireStarted(state);
      const { name } = event.payload;
      if (!state.eliminated.includes(name)) throw new Error("no estaba eliminado");
      return { ...state, eliminated: state.eliminated.filter((n) => n !== name) };
    }
    case "turns_reset": {
      requireStarted(state);
      return {
        ...state,
        eliminated: [],
        active: null,
        phase: 0,
        round: 1,
        direction: 1,
      };
    }
    case "cleared":
      return initialTurnsState();
  }
}

function isTurnsEvent(event: PlayEvent): event is TurnsEvent {
  return (TURNS_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

export function replayTurns(base: TurnsState | null, log: PlayEvent[]): TurnsState {
  return log.reduce((state, event) => {
    if (!isTurnsEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return turnsReducer(state, event);
  }, base ?? initialTurnsState());
}

export const TURNS_COMPACT_THRESHOLD = 200;
export const TURNS_COMPACT_KEEP = 20;

export function compactTurnsIfNeeded(input: { base: TurnsState | null; log: PlayEvent[] }): {
  base: TurnsState | null;
  log: PlayEvent[];
} {
  if (input.log.length <= TURNS_COMPACT_THRESHOLD) return input;
  const cut = input.log.length - TURNS_COMPACT_KEEP;
  return {
    base: replayTurns(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
