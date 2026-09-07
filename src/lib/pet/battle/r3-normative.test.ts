import { expect, it } from "vitest";
import normative from "./versions/r3.1/normative.json";
import { replayBattle } from "./replay";
import type { ResimInput } from "./record";
import { simulate } from "./engine";
import { ENEMIES, RULESET } from "./content";
import { battleDigest } from "./record";
import type { BattleRecord } from "./types";

it("el motor de trabajo conserva los eventos, resultado y digest publicados de R3", async () => {
 const record = normative.record as BattleRecord;
 const out = simulate({ seed: record.seed, snapshot: record.snapshot, enemy: ENEMIES[record.enemyId], ruleset: RULESET }, record.inputs);
 expect(out.events).toEqual(normative.events);
 expect(out.result).toEqual(record.result);
 expect(await battleDigest(record, out.events)).toBe(normative.digest);
});
it("retains the R3 recipe, barrier, events and digest", async () => {
 const out=await replayBattle(normative.record as ResimInput);
 expect(out.ok).toBe(true);if(!out.ok)return;
 expect(out.events).toEqual(normative.events);expect(out.result).toEqual(normative.record.result);expect(out.digest).toBe(normative.digest);
});
