import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import { PlayEventError } from "@/lib/play/core/errors";
import type { Participant } from "@/lib/play/core/types";
import type {
  GameStartedEvent,
  RoundEditedEvent,
  RoundScoredEvent,
  GameFinishedEvent,
  GameLabeledEvent,
} from "./events";
import { initialScoreState, scoreReducer } from "./reducer";
import type { ScoreSetup } from "./types";

const gente = (n: number): Participant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "guest" as const, name: `J${i + 1}` }));

const setup = (over: Partial<ScoreSetup> = {}): ScoreSetup => ({
  participants: gente(3),
  direction: "highest",
  ...over,
});

const started = (s: ScoreSetup = setup()) =>
  makeEvent<GameStartedEvent["type"], GameStartedEvent["payload"]>(
    "game_started",
    { toolId: "score", setup: s },
    1000,
  );

const ronda = (scores: number[], at = 2000) =>
  makeEvent<RoundScoredEvent["type"], RoundScoredEvent["payload"]>("round_scored", { scores }, at);

const edita = (round: number, scores: number[], at = 3000) =>
  makeEvent<RoundEditedEvent["type"], RoundEditedEvent["payload"]>("round_edited", { round, scores }, at);

const fin = (at = 9000) =>
  makeEvent<GameFinishedEvent["type"], GameFinishedEvent["payload"]>("game_finished", { reason: "manual" }, at);

const label = (gameName: string, at = 2000) =>
  makeEvent<GameLabeledEvent["type"], GameLabeledEvent["payload"]>("game_labeled", { gameName }, at);

describe("initialScoreState", () => {
  it("nace activa, sin rondas, con el setup y startedAt del evento", () => {
    const state = initialScoreState(started());
    expect(state.toolId).toBe("score");
    expect(state.status).toBe("active");
    expect(state.rounds).toEqual([]);
    expect(state.startedAt).toBe(1000);
    expect(state.finishedAt).toBeNull();
  });

  it("rechaza menos de 2 o más de 8 jugadores", () => {
    expect(() => initialScoreState(started(setup({ participants: gente(1) })))).toThrow(PlayEventError);
    expect(() => initialScoreState(started(setup({ participants: gente(9) })))).toThrow(PlayEventError);
  });

  it("rechaza un target sin sentido (valor no entero positivo)", () => {
    expect(() =>
      initialScoreState(started(setup({ target: { kind: "rounds", value: 0 } }))),
    ).toThrow(PlayEventError);
    expect(() =>
      initialScoreState(started(setup({ target: { kind: "points", value: 2.5 } }))),
    ).toThrow(PlayEventError);
  });
});

describe("round_scored", () => {
  it("añade la ronda entera de golpe", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([12, 4, 9]));
    s = scoreReducer(s, ronda([8, 15, 6], 2500));
    expect(s.rounds).toEqual([[12, 4, 9], [8, 15, 6]]);
  });

  it("acepta negativos y cero", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([-5, 0, 3]));
    expect(s.rounds[0]).toEqual([-5, 0, 3]);
  });

  it("rechaza longitud distinta del número de jugadores", () => {
    const s = initialScoreState(started());
    expect(() => scoreReducer(s, ronda([1, 2]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, ronda([1, 2, 3, 4]))).toThrow(PlayEventError);
  });

  it("rechaza valores no enteros o no finitos", () => {
    const s = initialScoreState(started());
    expect(() => scoreReducer(s, ronda([1.5, 2, 3]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, ronda([Number.NaN, 2, 3]))).toThrow(PlayEventError);
  });

  it("con target de rondas alcanzado SIGUE aceptando rondas: el límite es informativo", () => {
    let s = initialScoreState(started(setup({ target: { kind: "rounds", value: 1 } })));
    s = scoreReducer(s, ronda([1, 2, 3]));
    s = scoreReducer(s, ronda([4, 5, 6], 2500));
    expect(s.rounds).toHaveLength(2);
  });
});

describe("round_edited", () => {
  it("reemplaza una ronda existente sin tocar las demás", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    s = scoreReducer(s, ronda([4, 5, 6], 2500));
    s = scoreReducer(s, edita(0, [10, 2, 3]));
    expect(s.rounds).toEqual([[10, 2, 3], [4, 5, 6]]);
  });

  it("rechaza índice fuera de rango", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    expect(() => scoreReducer(s, edita(1, [9, 9, 9]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, edita(-1, [9, 9, 9]))).toThrow(PlayEventError);
  });

  it("valida scores igual que round_scored", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    expect(() => scoreReducer(s, edita(0, [1, 2]))).toThrow(PlayEventError);
  });
});

describe("game_finished", () => {
  it("marca finished con finishedAt del evento", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, ronda([1, 2, 3]));
    s = scoreReducer(s, fin());
    expect(s.status).toBe("finished");
    expect(s.finishedAt).toBe(9000);
  });

  it("tras finished, TODO evento se rechaza", () => {
    let s = initialScoreState(started());
    s = scoreReducer(s, fin());
    expect(() => scoreReducer(s, ronda([1, 2, 3]))).toThrow(PlayEventError);
    expect(() => scoreReducer(s, fin(9500))).toThrow(PlayEventError);
  });

  it("un game_started sobre una partida ya iniciada se rechaza", () => {
    const s = initialScoreState(started());
    expect(() => scoreReducer(s, started())).toThrow(PlayEventError);
  });
});

describe("game_labeled", () => {
  it("fija la etiqueta con la partida activa", () => {
    let s = initialScoreState(started(setup({ participants: gente(2) })));
    s = scoreReducer(s, label("UNO"));
    expect(s.setup.gameName).toBe("UNO");
  });

  it("también con la partida TERMINADA (excepción: etiquetar no es jugar)", () => {
    let s = initialScoreState(started(setup({ participants: gente(2) })));
    s = scoreReducer(s, fin(2000));
    const labeled = scoreReducer(s, label("dominó", 3000));
    expect(labeled.setup.gameName).toBe("dominó");
    expect(labeled.status).toBe("finished"); // etiquetar no revive nada
  });

  it("cadena vacía QUITA la etiqueta", () => {
    let s = initialScoreState(started(setup({ participants: gente(2) })));
    s = scoreReducer(s, label("UNO"));
    const cleared = scoreReducer(s, label("", 3000));
    expect(cleared.setup.gameName).toBeUndefined();
  });

  it("cualquier OTRO evento sobre terminada sigue rechazándose", () => {
    let s = initialScoreState(started(setup({ participants: gente(2) })));
    s = scoreReducer(s, fin(2000));
    expect(() => scoreReducer(s, ronda([1, 1], 3000))).toThrow();
  });
});
