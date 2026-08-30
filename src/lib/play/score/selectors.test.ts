import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { Participant } from "@/lib/play/core/types";
import type { GameStartedEvent, RoundScoredEvent } from "./events";
import { initialScoreState, scoreReducer } from "./reducer";
import { describeEvent, limitReached, scoreRanking, totals } from "./selectors";
import type { ScoreSetup, ScoreState } from "./types";

const gente = (n: number): Participant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "guest" as const, name: `J${i + 1}` }));

function conRondas(rounds: number[][], over: Partial<ScoreSetup> = {}): ScoreState {
  const setup: ScoreSetup = { participants: gente(rounds[0]?.length ?? 3), direction: "highest", ...over };
  let s = initialScoreState(
    makeEvent<GameStartedEvent["type"], GameStartedEvent["payload"]>(
      "game_started",
      { toolId: "score", setup },
      1000,
    ),
  );
  let at = 2000;
  for (const r of rounds) {
    s = scoreReducer(
      s,
      makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>("round_scored", { scores: r }, at++),
    );
  }
  return s;
}

describe("totals", () => {
  it("suma por asiento; sin rondas, todo ceros", () => {
    expect(totals(conRondas([[12, 4, 9], [8, 15, 6], [5, 11, 8]]))).toEqual([25, 30, 23]);
    expect(totals(conRondas([]))).toEqual([0, 0, 0]);
  });
});

describe("scoreRanking", () => {
  it("con highest gana el mayor", () => {
    const ranking = scoreRanking(conRondas([[12, 4, 9], [8, 15, 6], [5, 11, 8]]));
    expect(ranking[0]).toEqual({ seat: 1, total: 30, position: 1 });
    expect(ranking[1]).toEqual({ seat: 0, total: 25, position: 2 });
    expect(ranking[2]).toEqual({ seat: 2, total: 23, position: 3 });
  });

  it("con lowest gana el menor", () => {
    const ranking = scoreRanking(conRondas([[12, 4, 9]], { direction: "lowest" }));
    expect(ranking[0].seat).toBe(1);
  });

  it("empate comparte posición y la siguiente salta (1,1,3)", () => {
    const ranking = scoreRanking(conRondas([[10, 10, 3]]));
    expect(ranking.map((r) => r.position)).toEqual([1, 1, 3]);
  });
});

describe("limitReached", () => {
  it("sin target, nunca", () => {
    expect(limitReached(conRondas([[1, 2, 3], [1, 2, 3]]))).toBe(false);
  });

  it("target de rondas: al completar la última", () => {
    const target = { kind: "rounds" as const, value: 2 };
    expect(limitReached(conRondas([[1, 2, 3]], { target }))).toBe(false);
    expect(limitReached(conRondas([[1, 2, 3], [4, 5, 6]], { target }))).toBe(true);
  });

  it("target de puntos: cuando ALGÚN total alcanza el valor, en ambas direcciones", () => {
    const target = { kind: "points" as const, value: 20 };
    expect(limitReached(conRondas([[9, 5, 3]], { target }))).toBe(false);
    expect(limitReached(conRondas([[9, 5, 3], [11, 2, 1]], { target }))).toBe(true);
    // Con lowest la semántica es la misma: llegar a X vuelve la partida finalizable.
    expect(limitReached(conRondas([[19, 5, 3], [1, 2, 1]], { target, direction: "lowest" }))).toBe(true);
  });
});

describe("describeEvent", () => {
  it("etiqueta las rondas con su número humano (1-based)", () => {
    const s = conRondas([[1, 2, 3]]);
    const scored = makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>(
      "round_scored",
      { scores: [1, 2, 3] },
      5000,
    );
    expect(describeEvent(scored, s)).toEqual({ key: "roundScored", params: { round: 2 } });
  });
});
