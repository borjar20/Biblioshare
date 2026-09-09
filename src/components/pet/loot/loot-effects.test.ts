import { expect, it } from "vitest";
import { lootEffectsForTick, lootFeedbackForTick, type LootEffect } from "./loot-effects";
const event: LootEffect = { type:"LOOT_EFFECT",seq:2,tick:10,itemId:"sharp_bookmark",copyId:"a",effect:"damage",amount:10 };
it("keeps readable feedback after the burst expires, until a newer activation",()=>{
 const later:LootEffect={...event,seq:4,tick:30,effect:"shield"};
 expect(lootFeedbackForTick([event,later],25)).toEqual([event]);
 expect(lootFeedbackForTick([event,later],31)).toEqual([later]);
 expect(lootFeedbackForTick([event],25,20)).toEqual([]);
});
it("a later status in the same tick cannot hide a loot activation", () => {
  expect(lootEffectsForTick([event,{type:"STATUS_APPLIED",seq:3,tick:10,status:"stagger",until:30}])).toEqual([event]);
});
it("keeps concurrent effects and expires them against the simulation clock", () => {
  const second:LootEffect={...event,seq:3,itemId:"loan_pendant",effect:"cooldown"};
  expect(lootEffectsForTick([event,second],11)).toEqual([event,second]);
  expect(lootEffectsForTick([event,second],19)).toEqual([]);
  expect(lootEffectsForTick([event],9)).toEqual([]);
  expect(lootEffectsForTick([event],11,11)).toEqual([]);
});
