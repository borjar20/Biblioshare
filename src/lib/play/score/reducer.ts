import { PlayEventError } from "@/lib/play/core/errors";
import type { GameStartedEvent, ScoreEvent } from "./events";
import type { ScoreState } from "./types";

// Misma disciplina que mtg/reducer.ts: puro, switch exhaustivo, rechazo =
// PlayEventError (el store lo convierte en `false`, spec fases 0-2 §4).

function assertScores(scores: number[], players: number): void {
  if (scores.length !== players) {
    throw new PlayEventError(`ronda con ${scores.length} puntuaciones para ${players} jugadores`);
  }
  for (const value of scores) {
    if (!Number.isInteger(value)) {
      throw new PlayEventError(`puntuación no entera: ${value}`);
    }
  }
}

export function initialScoreState(event: GameStartedEvent): ScoreState {
  const { setup } = event.payload;
  if (setup.participants.length < 2 || setup.participants.length > 8) {
    throw new PlayEventError(`puntuación admite de 2 a 8 jugadores, no ${setup.participants.length}`);
  }
  if (setup.target && (!Number.isInteger(setup.target.value) || setup.target.value < 1)) {
    throw new PlayEventError(`target inválido: ${setup.target.value}`);
  }
  return {
    toolId: "score",
    status: "active",
    setup,
    rounds: [],
    startedAt: event.at,
    finishedAt: null,
  };
}

export function scoreReducer(state: ScoreState, event: ScoreEvent): ScoreState {
  // Excepción única al candado de finished: etiquetar no es jugar, y el caso
  // principal es ponerle nombre al juego desde el RESUMEN (spec etiqueta §2).
  if (state.status === "finished" && event.type !== "game_labeled") {
    throw new PlayEventError(`evento ${event.type} sobre una partida terminada`);
  }
  switch (event.type) {
    case "game_started":
      throw new PlayEventError("game_started sobre una partida ya iniciada");
    case "round_scored": {
      assertScores(event.payload.scores, state.setup.participants.length);
      return { ...state, rounds: [...state.rounds, event.payload.scores] };
    }
    case "round_edited": {
      const { round, scores } = event.payload;
      if (round < 0 || round >= state.rounds.length) {
        throw new PlayEventError(`ronda ${round} no existe (hay ${state.rounds.length})`);
      }
      assertScores(scores, state.setup.participants.length);
      const rounds = state.rounds.map((r, i) => (i === round ? scores : r));
      return { ...state, rounds };
    }
    case "game_finished":
      return { ...state, status: "finished", finishedAt: event.at };
    case "game_labeled": {
      const gameName = event.payload.gameName === "" ? undefined : event.payload.gameName;
      return { ...state, setup: { ...state.setup, gameName } };
    }
  }
}
