import { expect, it, vi } from "vitest";
// A future current API or class catalog must not be loaded by historical replay.
vi.mock("./record", () => { throw new Error("mutable record loaded"); });
vi.mock("../classes", () => { throw new Error("mutable classes loaded"); });
import { replayBattle } from "./replay";
import normative from "./versions/r3.1/normative.json";
import type { ResimInput } from "./record";
it("R3 replay owns its snapshot guard and executable boundary", async () => {
 const record = normative.record as unknown as ResimInput;
 const out = await replayBattle(record);
 expect(out.ok).toBe(true);if(out.ok) expect(out.digest).toBe(normative.digest);
 expect(await replayBattle({...record,snapshot:{...record.snapshot,petClass:"future-class"} as unknown as ResimInput["snapshot"]})).toEqual({ok:false,code:"INVALID_SNAPSHOT"});
});
