import { expect, it } from "vitest";
import { trainingEffects } from "./training-effects";

it("an interrupt still strikes and recoils when its status is the last event", () => {
  expect(trainingEffects([
    { type: "SKILL_USED", seq: 4, tick: 22, effect: "interrupt", damage: 40, enemyHp: 100, petHp: 100 },
    { type: "STATUS_APPLIED", seq: 5, tick: 22, status: "stagger", until: 42 },
  ])).toEqual({ strike: 4, enemyHit: 4, petHit: undefined });
});

it("does not replay damage from an earlier tick when a new telegraph starts", () => {
  expect(trainingEffects([
    { type: "PET_BASIC", seq: 3, tick: 15, damage: 10, enemyHp: 100, guarded: false },
    { type: "TELEGRAPH_STARTED", seq: 4, tick: 22, kind: "charge", resolvesAt: 37 },
  ])).toEqual({ strike: undefined, enemyHit: undefined, petHit: undefined });
});
