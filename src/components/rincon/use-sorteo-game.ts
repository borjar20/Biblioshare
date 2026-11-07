import type { SorteoItem } from "./sorteo-logic";

// Fases de la partida (spec «La partida»). El reducer es puro: los
// temporizadores y animaciones viven en SorteoStage y solo despachan acciones.
export type Phase =
  | "loading" | "error" | "empty" | "choose" | "roll" | "present" | "discard" | "discarded"
  | "duel" | "duelLuck" | "duelPicked" | "reveal" | "starting" | "started";

export type GameState = {
  phase: Phase;
  candidates: SorteoItem[];
  presented: number;
  duelPick: number | null;
  winner: SorteoItem | null;
  discarded: SorteoItem | null;
  solo: boolean;
  ctaError: boolean;
};

export type GameAction =
  | { type: "reset" }
  | { type: "loaded"; empty: boolean }
  | { type: "failed" }
  | { type: "reload" }
  | { type: "roll"; candidates: SorteoItem[] }
  | { type: "rolled" }
  | { type: "presentNext" }
  | { type: "skipPresent" }
  | { type: "skipToDuel" }
  | { type: "discard"; index: number }
  | { type: "toDuel" }
  | { type: "pick"; index: number }
  | { type: "confirmPick" }
  | { type: "luck" }
  | { type: "win"; index: number }
  | { type: "again" }
  | { type: "start" }
  | { type: "startDone" }
  | { type: "startFailed" };

export const INITIAL_GAME: GameState = {
  phase: "loading", candidates: [], presented: 0, duelPick: null,
  winner: null, discarded: null, solo: false, ctaError: false,
};

function afterPresent(s: GameState): GameState {
  const presented = s.candidates.length;
  if (s.candidates.length === 1) return { ...s, presented, phase: "reveal", winner: s.candidates[0], solo: true };
  if (s.candidates.length === 2) return { ...s, presented, phase: "duel" };
  return { ...s, presented, phase: "discard" };
}

export function gameReducer(s: GameState, a: GameAction): GameState {
  switch (a.type) {
    case "reset":
      return INITIAL_GAME;
    case "loaded":
      return s.phase === "loading" ? { ...INITIAL_GAME, phase: a.empty ? "empty" : "choose" } : s;
    case "failed":
      return s.phase === "loading" ? { ...s, phase: "error" } : s;
    case "reload":
      return s.phase === "error" ? INITIAL_GAME : s;
    case "roll":
      if (s.phase !== "choose" || a.candidates.length === 0) return s;
      return { ...INITIAL_GAME, phase: "roll", candidates: a.candidates };
    case "rolled":
      return s.phase === "roll" ? { ...s, phase: "present", presented: 0 } : s;
    case "presentNext":
      if (s.phase !== "present") return s;
      return s.presented < s.candidates.length ? { ...s, presented: s.presented + 1 } : afterPresent(s);
    case "skipPresent":
      return s.phase === "present" ? afterPresent(s) : s;
    case "skipToDuel": {
      if (s.phase !== "roll") return s;
      const candidates = s.candidates.slice(0, 2);
      const presented = candidates.length;
      return candidates.length === 1
        ? { ...s, candidates, presented, phase: "reveal", winner: candidates[0], solo: true }
        : { ...s, candidates, presented, phase: "duel" };
    }
    case "discard":
      if (s.phase !== "discard" || !s.candidates[a.index]) return s;
      return {
        ...s,
        phase: "discarded",
        discarded: s.candidates[a.index],
        candidates: s.candidates.filter((_, i) => i !== a.index),
      };
    case "toDuel":
      return s.phase === "discarded" ? { ...s, phase: "duel", discarded: null } : s;
    case "pick":
      return s.phase === "duel" && s.candidates[a.index] ? { ...s, duelPick: a.index } : s;
    case "confirmPick":
      return s.phase === "duel" && s.duelPick !== null ? { ...s, phase: "duelPicked" } : s;
    case "luck":
      return s.phase === "duel" ? { ...s, phase: "duelLuck", duelPick: null } : s;
    case "win":
      if ((s.phase !== "duelLuck" && s.phase !== "duelPicked") || !s.candidates[a.index]) return s;
      return { ...s, phase: "reveal", winner: s.candidates[a.index] };
    case "again":
      return s.phase === "reveal" ? { ...INITIAL_GAME, phase: "choose" } : s;
    case "start":
      return s.phase === "reveal" ? { ...s, phase: "starting", ctaError: false } : s;
    case "startDone":
      return s.phase === "starting" ? { ...s, phase: "started" } : s;
    case "startFailed":
      return s.phase === "starting" ? { ...s, phase: "reveal", ctaError: true } : s;
  }
}
