import { expect, it, vi } from "vitest";
import { createTrainingService } from "./service";
import type { TrainingBattle } from "./types";
import { snapshotForProfile } from "../battle/profiles";
import { contentHash } from "../battle/versions/r2.2/content";

// A future current schema may reject an old snapshot. Stored releases still own it.
vi.mock("../battle/record", () => ({ isBattleSnapshot: () => false }));

it("starting, resolving and replaying stored R2 never use today's snapshot guard", async () => {
  const intentId = "54e5f63c-68a8-4acf-a790-6938580d48a5";
  let row: TrainingBattle = {
    intentId, status: "open", seed: "00000001000000020000000300000004",
    snapshot: snapshotForProfile("social", "bard"), rulesetVersion: "r2.2",
    contentHash: await contentHash(), enemyId: "brote", inputs: [], result: null, digest: null,
  };
  const service = createTrainingService({
    repository: {
      find: async () => structuredClone(row),
      insert: async () => { throw Error("must reuse old battle"); },
      resolve: async battle => { row = battle; return battle; },
    },
    snapshot: async () => { throw Error("must reuse old snapshot"); },
    seed: () => { throw Error("must reuse old seed"); },
  });
  expect((await service.start(intentId)).ok).toBe(true);
  const resolved = await service.resolve(intentId, []);
  expect(resolved.ok).toBe(true);
  expect(await service.replay(intentId)).toEqual(resolved);
});
