import type { PlayEvent } from "@/lib/play/core/types";
import type { ScoreSetup } from "./types";

// `toolId` va como literal "score", no como ToolId: este fichero es anterior a
// que la unión crezca (PR-A no toca el registro) y el literal es más estrecho.
export type GameStartedEvent = PlayEvent<"game_started", { toolId: "score"; setup: ScoreSetup }>;
// UNA ronda = UN evento; por asiento, longitud = jugadores (spec §2).
export type RoundScoredEvent = PlayEvent<"round_scored", { scores: number[] }>;
export type RoundEditedEvent = PlayEvent<"round_edited", { round: number; scores: number[] }>;
// El ganador NO viaja en el evento: se deriva de los totales al replayar.
export type GameFinishedEvent = PlayEvent<"game_finished", { reason: "manual" }>;
// Etiquetar el juego («UNO») en cualquier momento, TAMBIÉN con la partida
// terminada (el caso principal es el resumen). "" = quitar la etiqueta.
export type GameLabeledEvent = PlayEvent<"game_labeled", { gameName: string }>;

export type ScoreEvent =
  | GameStartedEvent
  | RoundScoredEvent
  | RoundEditedEvent
  | GameFinishedEvent
  | GameLabeledEvent;

// Mismo patrón anti-olvido que MTG_EVENT_TYPE_MAP (ver mtg/events.ts:27-50):
// añadir un evento a la unión y olvidarlo aquí es error de compilación.
const SCORE_EVENT_TYPE_MAP = {
  game_started: true,
  round_scored: true,
  round_edited: true,
  game_finished: true,
  game_labeled: true,
} satisfies Record<ScoreEvent["type"], true>;

export const SCORE_EVENT_TYPES: ReadonlySet<ScoreEvent["type"]> = new Set(
  Object.keys(SCORE_EVENT_TYPE_MAP) as ScoreEvent["type"][],
);
