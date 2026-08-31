import { describe, expect, it } from "vitest";
import { playTools, UNKNOWN_EVENT_DESCRIPTION, buildSavedSummary } from "./tools";
import { initialMtgState } from "./mtg/reducer";
import { ev, started } from "./mtg/test-fixtures";
import type { LifeChangedEvent } from "./mtg/events";
import { makeEvent } from "./core/events";
import { replay } from "./core/replay";
import type { PlayEvent } from "./core/types";
import type { ScoreSetup } from "./score/types";
import type { MtgSetup } from "./mtg/types";

// Cubre el registro de dominio ampliado (findings 6 y 8 de la revisión final):
// describe() etiqueta cualquier PlayEvent sin que la llamadora conozca la
// herramienta, y hace de guarda en runtime para un `type` que no es de Commander.

describe("playTools.mtg", () => {
  const state = initialMtgState(started(1000));

  it("expone i18nKey y setupRoute como datos planos (spec §6)", () => {
    expect(playTools.mtg.i18nKey).toBe("mtg");
    expect(playTools.mtg.setupRoute).toBe("/partidas/mtg/nueva");
  });

  it("describe() etiqueta un evento reconocido igual que describeEvent directamente", () => {
    const event = ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -3 }, 2000);
    expect(playTools.mtg.describe(event, state)).toEqual({ key: "lifeLost", params: { name: "ana", amount: 3 } });
  });

  it("describe() cae al fallback 'unknown' ante un type que no pertenece a MtgEvent", () => {
    const foreign = { id: "e-x", type: "score_round_added", at: 2000, payload: {} };
    expect(playTools.mtg.describe(foreign, state)).toEqual(UNKNOWN_EVENT_DESCRIPTION);
    expect(playTools.mtg.describe(foreign, state)).toEqual({ key: "unknown", params: {} });
  });
});

// Logs mínimos válidos para buildSavedSummary: game_started + eventos +
// game_finished, replayados con el motor real (core/replay.ts), igual que
// score/replay.test.ts. Ana es "user" (con userId) a propósito: el tercer
// test necesita al menos un participante user para comprobar que solo ese
// conserva userId.

const scoreSetup: ScoreSetup = {
  participants: [
    { id: "ana", kind: "user", name: "Ana", userId: "user-ana-1" },
    { id: "beto", kind: "guest", name: "Beto" },
  ],
  direction: "highest",
};

const scoreFinishedLog: PlayEvent[] = [
  makeEvent("game_started", { toolId: "score" as const, setup: scoreSetup }, 1000),
  makeEvent("round_scored", { scores: [5, 3] }, 1500),
  makeEvent("game_finished", { reason: "manual" as const }, 2000),
];

const mtgSetup: MtgSetup = {
  mode: "commander",
  participants: [
    { id: "ana", kind: "user", name: "Ana", userId: "user-ana-1", commanders: [{ id: "ana-c1", name: "Atraxa" }] },
    { id: "beto", kind: "guest", name: "Beto", commanders: [{ id: "beto-c1", name: "Korvold" }] },
  ],
  startingLife: 40,
  startingSeat: 0,
};

const mtgFinishedLog: PlayEvent[] = [
  makeEvent("game_started", { toolId: "mtg" as const, setup: mtgSetup }, 1000),
  makeEvent("player_eliminated", { target: "beto" }, 1500),
  makeEvent("game_finished", { winner: "ana", reason: "last_standing" as const }, 2000),
];

describe("buildSavedSummary", () => {
  it("score: ganador por dirección, participantes planos, duración del estado", () => {
    // partida score de 2 jugadores, direction highest, una ronda [5, 3], finalizada
    const state = replay(scoreFinishedLog); // helper local: game_started + round_scored + game_finished
    const summary = buildSavedSummary(state);
    expect(summary.toolId).toBe("score");
    expect(summary.winners).toEqual([0]);
    expect(summary.ranking).toEqual([
      { seat: 0, position: 1 },
      { seat: 1, position: 2 },
    ]);
    expect(summary.participants.map((p) => p.name)).toEqual(["Ana", "Beto"]);
    expect(summary.tool).toMatchObject({ rounds: 1, direction: "highest", totals: [5, 3] });
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("mtg: ranking por asiento (no por participantId) y comandantes por nombre", () => {
    const state = replay(mtgFinishedLog); // 2 jugadores, seat 1 eliminado, seat 0 ganador
    const summary = buildSavedSummary(state);
    expect(summary.toolId).toBe("mtg");
    expect(summary.winners).toEqual([0]);
    expect(summary.ranking[0]).toEqual({ seat: 0, position: 1 });
    expect((summary.tool.commanders as (string | null)[]).length).toBe(2);
  });

  it("un participante user conserva userId; regular/guest no lo llevan", () => {
    const summary = buildSavedSummary(replay(scoreFinishedLog));
    for (const p of summary.participants) {
      if (p.kind === "user") expect(typeof p.userId).toBe("string");
      else expect("userId" in p).toBe(false);
    }
  });
});
