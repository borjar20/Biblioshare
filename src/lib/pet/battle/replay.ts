// Append-only release routing. Persisted identity always chooses the executable.
import * as r2 from "./versions/r2.2/content";
import * as r3 from "./versions/r3.1/content";
import { resimulate as replayR2, type ResimInput as R2Input } from "./versions/r2.2/record";
import { validateInputs as validateR2 } from "./legacy-inputs";
import { validateInputs } from "./versions/r3.1/inputs";
import { resimulate, type ResimInput } from "./versions/r3.1/record";
import { isBattleSnapshot } from "./snapshot";
import { isBattleSnapshot as isR3Snapshot } from "./versions/r3.1/snapshot";
import type { Ruleset, EnemyDef } from "./types";

export interface BattleRelease {
  readonly rulesetVersion: string;
  readonly contentHash: string;
  readonly ruleset: Ruleset;
  readonly enemies: Record<string, EnemyDef>;
  readonly isSnapshot: typeof isBattleSnapshot;
  readonly validateInputs: (raw: unknown) => ReturnType<typeof validateInputs>;
  readonly replay: (record: ResimInput) => ReturnType<typeof resimulate>;
}
export const BATTLE_RELEASES: readonly BattleRelease[] = Object.freeze([
  Object.freeze({
    rulesetVersion: "r2.2",
    contentHash: "2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3",
    ruleset: r2.RULESET as Ruleset,
    enemies: r2.ENEMIES,
    isSnapshot: isBattleSnapshot,
    validateInputs(raw: unknown): ReturnType<typeof validateInputs> {
      return validateR2(raw, r2.RULESET as Ruleset);
    },
    async replay(record: ResimInput) {
      if (!isBattleSnapshot(record.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" } as const;
      return replayR2(record as R2Input, { ruleset: r2.RULESET, enemies: r2.ENEMIES, contentHash: await r2.contentHash() });
    },
  }),
  Object.freeze({
    rulesetVersion: "r3.1",
    contentHash: "deebe918beee7f74ff9d9cda720caac9f9182713158085c118971970cce40cb3",
    ruleset: r3.RULESET,
    enemies: r3.ENEMIES,
    isSnapshot: isR3Snapshot,
    validateInputs: (raw: unknown) => validateInputs(raw, r3.RULESET),
    async replay(record: ResimInput) {
      return resimulate(record, { ruleset: r3.RULESET, enemies: r3.ENEMIES, contentHash: await r3.contentHash() });
    },
  }),
]);
export function getBattleRelease(version: string, hash: string): BattleRelease | undefined {
  return BATTLE_RELEASES.find(release => release.rulesetVersion === version && release.contentHash === hash);
}
export async function replayBattle(record: ResimInput, releases: readonly Pick<BattleRelease, "rulesetVersion" | "contentHash" | "replay">[] = BATTLE_RELEASES) {
  const release = releases.find(candidate => candidate.rulesetVersion === record.rulesetVersion && candidate.contentHash === record.contentHash);
  if (!release) return { ok: false, code: "UNKNOWN_RELEASE" } as const;
  return release.replay(record);
}
