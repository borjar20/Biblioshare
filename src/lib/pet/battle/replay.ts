// Append-only release routing. Persisted identity always chooses the executable.
import * as r2 from "./versions/r2.2/content";
import * as r3 from "./versions/r3.1/content";
import * as r4 from "./versions/r4.1/content";
import * as r4b from "./versions/r4.2/content";
import { validateInputs as validateR4b } from "./versions/r4.2/inputs";
import { resimulate as replayR4b } from "./versions/r4.2/record";
import { isBattleSnapshot as isR4bSnapshot } from "./versions/r4.2/snapshot";
import { resimulate as replayR2, type ResimInput as R2Input } from "./versions/r2.2/record";
import { validateInputs as validateR2 } from "./legacy-inputs";
import { validateInputs as validateR3 } from "./versions/r3.1/inputs";
import { resimulate as replayR3, type ResimInput as R3Input } from "./versions/r3.1/record";
import { isBattleSnapshot as isR3Snapshot } from "./versions/r3.1/snapshot";
import { validateInputs } from "./versions/r4.1/inputs";
import { resimulate, type ResimInput as HistoricalInput } from "./versions/r4.1/record";
import { isBattleSnapshot as isR4Snapshot } from "./versions/r4.1/snapshot";
import type { Ruleset, EnemyDef, BattleSnapshot as HistoricalSnapshot } from "./versions/r4.1/types";
import type { BattleSnapshot as EquipmentSnapshot } from "./versions/r4.2/types";

export type StoredBattleSnapshot = HistoricalSnapshot | EquipmentSnapshot;
export type StoredBattleInput = Omit<HistoricalInput,"snapshot"> & {snapshot:StoredBattleSnapshot};
type ResimInput = StoredBattleInput;
type ReplayResult = ReturnType<typeof replayR4b>;

export interface BattleRelease {
  readonly rulesetVersion: string;
  readonly contentHash: string;
  readonly ruleset: Ruleset;
  readonly enemies: Record<string, EnemyDef>;
  readonly isSnapshot: (value: unknown) => value is StoredBattleSnapshot;
  /** `fights` solo lo entiende r4.1; las versiones anteriores lo ignoran (un tramo). */
  readonly validateInputs: (raw: unknown, fights?: number) => ReturnType<typeof validateInputs>;
  readonly replay: (record: ResimInput) => ReplayResult;
}
export const BATTLE_RELEASES: readonly BattleRelease[] = Object.freeze([
  Object.freeze({
    rulesetVersion: "r2.2",
    contentHash: "2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3",
    ruleset: r2.RULESET as unknown as Ruleset,
    enemies: r2.ENEMIES,
    isSnapshot: isR3Snapshot,
    validateInputs(raw: unknown): ReturnType<typeof validateInputs> { return validateR2(raw, r2.RULESET as unknown as Ruleset); },
    async replay(record: ResimInput): ReturnType<typeof resimulate> {
      if (!isR3Snapshot(record.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" } as const;
      // r2.2 no conoce `result.fight` (campo de r4.1): la forma retenida es la
      // que firmó su propio digest, no la del enrutador actual.
      return replayR2(record as R2Input, { ruleset: r2.RULESET, enemies: r2.ENEMIES, contentHash: await r2.contentHash() }) as unknown as ReturnType<typeof resimulate>;
    },
  }),
  Object.freeze({
    rulesetVersion: "r3.1",
    contentHash: "deebe918beee7f74ff9d9cda720caac9f9182713158085c118971970cce40cb3",
    ruleset: r3.RULESET as unknown as Ruleset,
    enemies: r3.ENEMIES,
    isSnapshot: isR3Snapshot,
    validateInputs: (raw: unknown) => validateR3(raw, r3.RULESET),
    async replay(record: ResimInput): ReturnType<typeof resimulate> {
      // Misma nota: r3.1 tampoco lleva `fight` en su BattleResult retenido.
      return replayR3(record as R3Input, { ruleset: r3.RULESET, enemies: r3.ENEMIES, contentHash: await r3.contentHash() }) as unknown as ReturnType<typeof resimulate>;
    },
  }),
  Object.freeze({
    rulesetVersion: "r4.1",
    contentHash: "13cc440381ca001e230d35b4f6cd628bc5195bce9a14f2fa6b17af50eb63f765",
    ruleset: r4.RULESET,
    enemies: r4.ENEMIES,
    isSnapshot: isR4Snapshot,
    validateInputs: (raw: unknown, fights = 1) => validateInputs(raw, r4.RULESET, fights),
    async replay(record: ResimInput) {
      return resimulate(record, { ruleset: r4.RULESET, enemies: r4.ENEMIES, contentHash: await r4.contentHash() });
    },
  }),
  Object.freeze({
    rulesetVersion:"r4.2",
    contentHash:"87d22bd94e446efa56e14127be889a0c9a367dbd3dd39ea9e0d5bf67761c0834",
    ruleset:r4b.RULESET,
    enemies:r4b.ENEMIES,
    isSnapshot:isR4bSnapshot,
    validateInputs:(raw:unknown,fights=1)=>validateR4b(raw,r4b.RULESET,fights),
    async replay(record:ResimInput):ReplayResult {
      if(!isR4bSnapshot(record.snapshot))return {ok:false,code:"INVALID_SNAPSHOT"};
      return replayR4b({...record,snapshot:record.snapshot},{ruleset:r4b.RULESET,enemies:r4b.ENEMIES,contentHash:await r4b.contentHash()});
    },
  }),
]);
export function getBattleRelease(version: string, hash: string): BattleRelease | undefined {
  return BATTLE_RELEASES.find((release) => release.rulesetVersion === version && release.contentHash === hash);
}
export async function replayBattle(record: ResimInput, releases: readonly Pick<BattleRelease, "rulesetVersion" | "contentHash" | "replay">[] = BATTLE_RELEASES) {
  const release = releases.find((candidate) => candidate.rulesetVersion === record.rulesetVersion && candidate.contentHash === record.contentHash);
  if (!release) return { ok: false, code: "UNKNOWN_RELEASE" } as const;
  return release.replay(record);
}
