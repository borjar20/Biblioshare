import { expect, it } from "vitest";
import normative from "./versions/r4.1/normative.json";
import { replayBattle } from "./replay";
import type { ResimInput } from "./record";

it("conserva la cadena normativa de r4.1: eventos de tramo, resultado y digest", async () => {
  const out = await replayBattle(normative.record as ResimInput);
  expect(out.ok).toBe(true);
  if (!out.ok) return;
  expect(out.events).toEqual(normative.events);
  expect(out.result).toEqual(normative.record.result);
  expect(out.digest).toBe(normative.digest);
  expect(normative.record.enemyId.split(",").length).toBe(normative.record.result.fight);
  expect(out.events.filter((e) => e.type === "FIGHT_STARTED")).toHaveLength(normative.record.result.fight - 1);
});
