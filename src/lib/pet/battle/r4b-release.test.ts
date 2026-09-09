import { expect, it } from "vitest";
import { getBattleRelease, replayBattle } from "./replay";
import { contentHash } from "./versions/r4.2/content";
import oldR2 from "./versions/r2.2/normative.json";
import oldR3 from "./versions/r3.1/normative.json";
import oldR4 from "./versions/r4.1/normative.json";

it("registers r4.2 with mandatory equipment while historical snapshots remain valid", async () => {
  const release=getBattleRelease("r4.2",await contentHash());
  expect(release).toBeDefined();
  expect(release!.isSnapshot(oldR4.record.snapshot)).toBe(false);
  expect(release!.isSnapshot({...oldR4.record.snapshot,equipment:{weapon:null,amulet:null}})).toBe(true);
  for (const fixture of [oldR2,oldR3,oldR4]) {
    const result=await replayBattle(fixture.record as Parameters<typeof replayBattle>[0]);
    expect(result.ok && result.digest).toBe(fixture.digest);
  }
  expect(getBattleRelease("r4.2","0".repeat(64))).toBeUndefined();
});
