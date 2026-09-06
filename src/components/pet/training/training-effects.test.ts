import { expect, it } from "vitest";
import { trainingEffects } from "./training-effects";

it("an interrupt still strikes and recoils when its status is the last event", () => {
  expect(trainingEffects([
    { type: "SKILL_USED", shield: 0, seq: 4, tick: 22, effect: "interrupt", damage: 40, enemyHp: 100, petHp: 100 },
    { type: "STATUS_APPLIED", seq: 5, tick: 22, status: "stagger", until: 42 },
  ])).toEqual({ enemyStrike: undefined, strike: 4, enemyHit: 4, petHit: undefined });
});

it("does not replay damage from an earlier tick when a new telegraph starts", () => {
  expect(trainingEffects([
    { type: "PET_BASIC", seq: 3, tick: 15, damage: 10, enemyHp: 100, guarded: false },
    { type: "TELEGRAPH_STARTED", seq: 4, tick: 22, kind: "charge", resolvesAt: 37 },
  ])).toEqual({ enemyStrike: undefined, strike: undefined, enemyHit: undefined, petHit: undefined });
});

it("returns to idle after seven simulation ticks even with no newer event", () => {
 const events = [{type:"PET_BASIC" as const,seq:3,tick:15,damage:10,enemyHp:100,guarded:false}];
 expect(trainingEffects(events,21).strike).toBe(3);
 expect(trainingEffects(events,22)).toEqual({enemyStrike:undefined,strike:undefined,enemyHit:undefined,petHit:undefined});
});

it("plays enemy attack even when a shield absorbs the whole hit", () => {
  expect(trainingEffects([{ type: "ENEMY_BASIC", seq: 6, tick: 30, damage: 0, petHp: 100, shield: 10 }], 31).enemyStrike).toBe(6);
});