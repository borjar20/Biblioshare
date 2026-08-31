import { describe, expect, it } from "vitest";
import { gameNameSuggestions } from "./game-names";
import { makeEvent } from "../core/events";
import { replay } from "../core/replay";
import { buildSavedSummary } from "../tools";
import type { PlayEvent } from "../core/types";
import type { ScoreSetup } from "../score/types";
import type { MtgSetup } from "../mtg/types";
import type { SavedGameRecord } from "../core/db";

// Logs mínimos válidos para buildSavedSummary (mismo patrón que
// tools.test.ts / sync.test.ts): game_started + eventos + game_finished,
// replayados con el motor real -- nada de castear a mano el summary.

const scoreParticipants: ScoreSetup["participants"] = [
  { id: "ana", kind: "guest", name: "Ana" },
  { id: "beto", kind: "guest", name: "Beto" },
];

function scoreLog(gameName: string | null): PlayEvent[] {
  const setup: ScoreSetup = {
    participants: scoreParticipants,
    direction: "highest",
    ...(gameName !== null ? { gameName } : {}),
  };
  return [
    makeEvent("game_started", { toolId: "score" as const, setup }, 1000),
    makeEvent("round_scored", { scores: [5, 3] }, 1500),
    makeEvent("game_finished", { reason: "manual" as const }, 2000),
  ];
}

/** SavedGameRecord mínimo, herramienta "score", con la etiqueta y el savedAt dados. */
function savedScore(gameName: string | null, savedAt: number): SavedGameRecord {
  const committed = scoreLog(gameName);
  return {
    gameId: committed[0].id,
    identity: "anon",
    v: 2,
    committed,
    savedAt,
    summary: buildSavedSummary(replay(committed)),
    syncStatus: "synced",
    deletedAt: null,
  };
}

const mtgSetup: MtgSetup = {
  mode: "commander",
  participants: [
    { id: "ana", kind: "guest", name: "Ana", commanders: [{ id: "ana-c1" }] },
    { id: "beto", kind: "guest", name: "Beto", commanders: [{ id: "beto-c1" }] },
  ],
  startingLife: 40,
  startingSeat: 0,
};

function mtgLog(): PlayEvent[] {
  return [
    makeEvent("game_started", { toolId: "mtg" as const, setup: mtgSetup }, 1000),
    makeEvent("player_eliminated", { target: "beto" }, 1500),
    makeEvent("game_finished", { winner: "ana", reason: "last_standing" as const }, 2000),
  ];
}

/** SavedGameRecord mínimo, otra herramienta (mtg): para el test de exclusión. */
function savedMtg(savedAt: number): SavedGameRecord {
  const committed = mtgLog();
  return {
    gameId: committed[0].id,
    identity: "anon",
    v: 2,
    committed,
    savedAt,
    summary: buildSavedSummary(replay(committed)),
    syncStatus: "synced",
    deletedAt: null,
  };
}

describe("gameNameSuggestions", () => {
  it("únicos case/acentos-insensible conservando la grafía MÁS RECIENTE, orden por recencia", () => {
    const saved = [savedScore("uno", 1000), savedScore("UNO", 3000), savedScore("Dominó", 2000)];
    expect(gameNameSuggestions(saved, "")).toEqual(["UNO", "Dominó"]);
  });

  it("ignora partidas sin etiqueta, tombstones y otras herramientas", () => {
    const saved = [
      savedScore(null, 1000),
      { ...savedScore("Chinchón", 2000), deletedAt: 5 },
      savedMtg(3000),
    ];
    expect(gameNameSuggestions(saved, "")).toEqual([]);
  });

  it("filtra por prefijo de palabra como los chips de habituales", () => {
    const saved = [savedScore("UNO", 1000), savedScore("Dominó cubano", 2000)];
    expect(gameNameSuggestions(saved, "cub")).toEqual(["Dominó cubano"]);
  });

  it("máximo 6", () => {
    const saved = Array.from({ length: 9 }, (_, i) => savedScore(`Juego ${i}`, i));
    expect(gameNameSuggestions(saved, "").length).toBe(6);
  });
});
