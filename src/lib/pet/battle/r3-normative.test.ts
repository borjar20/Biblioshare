import { expect, it } from "vitest";
import normative from "./versions/r3.1/normative.json";
import { replayBattle } from "./replay";
import type { ResimInput } from "./record";
it("retains the R3 recipe, barrier, events and digest", async () => {
 const out=await replayBattle(normative.record as unknown as ResimInput);
 expect(out.ok).toBe(true);if(!out.ok)return;
 expect(out.events).toEqual(normative.events);expect(out.result).toEqual(normative.record.result);expect(out.digest).toBe(normative.digest);
});
