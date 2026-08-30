import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import { replay } from "@/lib/play/core/replay";
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

    // Aplicar toda la secuencia, CAPTURANDO el estado real previo al último
    // evento: la invariante de undo por prefijo se comprueba contra lo que de
    // verdad existió, no contra el estado final reparcheado a mano (que solo
    // probaría «qué campos toca game_finished», y quedaría rancio si el
    // reducer creciera).
    let replayA = initialScoreState(startedEvent);
    let beforeFin = replayA;
    for (let i = 1; i < events.length; i++) {
      beforeFin = replayA;
      replayA = scoreReducer(replayA, events[i]);
    }

    // Replay completo, pero contra el motor REAL (core/replay.ts) y no contra
    // otra pasada del mismo bucle: `score` ya está en el registro playTools
    // (PR-B), así que este es el gate de verdad — reconstruye vía
    // `playTools.score.init/reduce`, exactamente como hace el store al
    // rehidratar desde el snapshot.
    const replayFromEngine = replay(events);

    // Determinismo total: mismo input, mismo estado profundo
    expect(replayFromEngine).toEqual(replayA);

    // Undo por prefijo: quitar el último evento = estado anterior REAL
    const beforeLastEvent = events.slice(0, -1);
    let stateBeforeLast = initialScoreState(startedEvent);
    for (let i = 1; i < beforeLastEvent.length; i++) {
      stateBeforeLast = scoreReducer(stateBeforeLast, beforeLastEvent[i]);
    }

    expect(stateBeforeLast).toEqual(beforeFin);
  });
});
