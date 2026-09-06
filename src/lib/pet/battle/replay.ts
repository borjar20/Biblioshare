import { isBattleSnapshot } from "./snapshot";
// Registry is append-only: a release owns both its content and executable rules.
// Unknown identities fail closed; never fall back to today's engine/content.
import { ENEMIES, RULESET, contentHash } from "./versions/r2.2/content";
import { resimulate, type ResimInput } from "./versions/r2.2/record";

export interface BattleRelease {
  readonly rulesetVersion: string;
  readonly contentHash: string;
  readonly replay: (record: ResimInput) => Promise<Awaited<ReturnType<typeof resimulate>> | { ok: false; code: "INVALID_SNAPSHOT" }>;
}

export const BATTLE_RELEASES: readonly BattleRelease[] = Object.freeze([
  Object.freeze({
    rulesetVersion: "r2.2",
    contentHash: "2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3",
    async replay(record: ResimInput) {
      if (!isBattleSnapshot(record.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" } as const;
      return resimulate(record, { ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() });
    },
  }),
]);

/** The persisted record carries everything needed to select a retained release. */
export async function replayBattle(record: ResimInput, releases = BATTLE_RELEASES) {
  const release = releases.find((candidate) =>
    candidate.rulesetVersion === record.rulesetVersion && candidate.contentHash === record.contentHash,
  );
  if (!release) return { ok: false, code: "UNKNOWN_RELEASE" } as const;
  return release.replay(record);
}
