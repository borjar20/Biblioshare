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

// Empate a 3: dos totales iguales con direction "highest" (ronda [7, 7, 3]).
// Cubre la mutación "gana solo el primero" (winners = [ranking[0].seat]).
const tieScoreSetup: ScoreSetup = {
  participants: [
    { id: "ana", kind: "guest", name: "Ana" },
    { id: "beto", kind: "guest", name: "Beto" },
    { id: "carlos", kind: "guest", name: "Carlos" },
  ],
  direction: "highest",
};

const tieScoreFinishedLog: PlayEvent[] = [
  makeEvent("game_started", { toolId: "score" as const, setup: tieScoreSetup }, 1000),
  makeEvent("round_scored", { scores: [7, 7, 3] }, 1500),
  makeEvent("game_finished", { reason: "manual" as const }, 2000),
];

// Log SIN game_finished: partida activa (replay del log en vivo antes del
// cierre). buildSavedSummary no exige finished -- es legal invocarla aquí.
const scoreActiveLog: PlayEvent[] = [
  makeEvent("game_started", { toolId: "score" as const, setup: scoreSetup }, 1000),
  makeEvent("round_scored", { scores: [5, 3] }, 1500),
];

// Partner (dos comandantes con nombre) y comandante sin nombre, en el mismo
// fixture: cubre las dos ramas de `commanders` en summarizeMtg.
const partnerMtgSetup: MtgSetup = {
  mode: "commander",
  participants: [
    {
      id: "ana",
      kind: "guest",
      name: "Ana",
      commanders: [
        { id: "ana-c1", name: "Kraum" },
        { id: "ana-c2", name: "Tymna" },
      ],
    },
    { id: "beto", kind: "guest", name: "Beto", commanders: [{ id: "beto-c1" }] },
  ],
  startingLife: 40,
  startingSeat: 0,
};

const partnerMtgFinishedLog: PlayEvent[] = [
  makeEvent("game_started", { toolId: "mtg" as const, setup: partnerMtgSetup }, 1000),
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
    // durationMs = finishedAt - startedAt, calculado de los `at` del fixture
    // (game_finished.at - game_started.at), no una desigualdad tautológica.
    expect(summary.durationMs).toBe(scoreFinishedLog[2].at - scoreFinishedLog[0].at);
  });

  it("score: empate a 3 (direction highest) reparte position 1 entre AMBOS asientos, no solo el primero", () => {
    const summary = buildSavedSummary(replay(tieScoreFinishedLog));
    expect(summary.winners).toEqual([0, 1]);
    expect(summary.ranking).toEqual([
      { seat: 0, position: 1 },
      { seat: 1, position: 1 },
      { seat: 2, position: 3 },
    ]);
  });

  it("score: partida activa (sin game_finished) -- durationMs es 0, no revienta", () => {
    const summary = buildSavedSummary(replay(scoreActiveLog));
    expect(summary.durationMs).toBe(0);
  });

  it("mtg: ranking por asiento (no por participantId) y comandantes por nombre", () => {
    const state = replay(mtgFinishedLog); // 2 jugadores, seat 1 eliminado, seat 0 ganador
    const summary = buildSavedSummary(state);
    expect(summary.toolId).toBe("mtg");
    expect(summary.winners).toEqual([0]);
    expect(summary.ranking).toEqual([
      { seat: 0, position: 1 },
      { seat: 1, position: 2 },
    ]);
    expect((summary.tool.commanders as (string | null)[]).length).toBe(2);
  });

  it("mtg: partner se junta con ' / ' y comandante sin nombre da null", () => {
    const summary = buildSavedSummary(replay(partnerMtgFinishedLog));
    expect(summary.tool.commanders).toEqual(["Kraum / Tymna", null]);
  });

  it("un participante user conserva userId; regular/guest no lo llevan", () => {
    const summary = buildSavedSummary(replay(scoreFinishedLog));
    for (const p of summary.participants) {
      if (p.kind === "user") expect(typeof p.userId).toBe("string");
      else expect("userId" in p).toBe(false);
    }
  });

  it("un participante regular conserva playerId; guest/user no lo llevan", () => {
    const regularScoreSetup: ScoreSetup = {
      participants: [
        { id: "ana", kind: "user", name: "Ana", userId: "user-ana-1" },
        { id: "pablo", kind: "regular", name: "Pablo", playerId: "j1" },
        { id: "beto", kind: "guest", name: "Beto" },
      ],
      direction: "highest",
    };
    const regularScoreLog: PlayEvent[] = [
      makeEvent("game_started", { toolId: "score" as const, setup: regularScoreSetup }, 1000),
      makeEvent("round_scored", { scores: [5, 3, 1] }, 1500),
      makeEvent("game_finished", { reason: "manual" as const }, 2000),
    ];
    const summary = buildSavedSummary(replay(regularScoreLog));
    expect(summary.participants[1]).toMatchObject({ kind: "regular", playerId: "j1" });
    for (const p of summary.participants) {
      if (p.kind !== "regular") expect("playerId" in p).toBe(false);
    }
  });
});
