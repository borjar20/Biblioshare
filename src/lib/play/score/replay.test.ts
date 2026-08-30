import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { Participant } from "@/lib/play/core/types";
import type { GameStartedEvent, RoundEditedEvent, RoundScoredEvent, GameFinishedEvent } from "./events";
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

describe("reconstrucción", () => {
  it("estado inicial + eventos reconstruye exactamente el estado final", () => {
    // Secuencia: started → 3 rondas → edita ronda 1 → finished
    const startedEvent = started();
    const events: Array<typeof startedEvent | ReturnType<typeof ronda> | ReturnType<typeof edita> | ReturnType<typeof fin>> = [
      startedEvent,
      ronda([12, 4, 9], 2000),
      ronda([8, 15, 6], 2001),
      ronda([5, 11, 8], 2002),
      edita(1, [8, 20, 6], 2003),
      fin(9000),
    ];

    // Aplicar toda la secuencia
    let replayA = initialScoreState(startedEvent);
    for (let i = 1; i < events.length; i++) {
      replayA = scoreReducer(replayA, events[i]);
    }

    // Replay completo: aplicar la MISMA secuencia dos veces desde cero
    let replayB = initialScoreState(startedEvent);
    for (let i = 1; i < events.length; i++) {
      replayB = scoreReducer(replayB, events[i]);
    }

    // Determinismo total: mismo input, mismo estado profundo
    expect(replayA).toEqual(replayB);

    // Undo por prefijo: quitar el último evento = estado anterior
    const beforeLastEvent = events.slice(0, -1);
    let stateBeforeLast = initialScoreState(startedEvent);
    for (let i = 1; i < beforeLastEvent.length; i++) {
      stateBeforeLast = scoreReducer(stateBeforeLast, beforeLastEvent[i]);
    }

    // El estado antes del último evento debe ser igual al estado replayA sin el fin
    const replayAWithoutFin = { ...replayA, status: "active" as const, finishedAt: null };
    expect(stateBeforeLast).toEqual(replayAWithoutFin);
  });
});
