import type { BattleEvent, BattleInput, BattleResult } from "../battle/types";
import type { StoredBattleSnapshot } from "../battle/replay";
import type { Reward } from "../loot/catalog";
import type { LootCopy } from "../loot/types";

/** Public projection: no account identifiers or database-only fields. */
export interface TrainingBattle {
  intentId: string;
  status: "open" | "resolved";
  seed: string;
  snapshot: StoredBattleSnapshot;
  rulesetVersion: string;
  contentHash: string;
  enemyId: string;
  inputs: BattleInput[];
  result: BattleResult | null;
  digest: string | null;
  /** Solo en aventuras (R4a). */
  adventure?: { day: string; attempt: number; reward: Reward | null; copy?: LootCopy | null };
}

export type TrainingResponse =
  | { ok: true; battle: TrainingBattle; events?: BattleEvent[] }
  | { ok: false; code: string };

/** Repository is scoped to an authenticated user before service construction. */
export interface TrainingRepository {
  find(intentId: string): Promise<TrainingBattle | null>;
  /** Returns the existing winner on a concurrent duplicate insert. */
  insert(battle: TrainingBattle): Promise<TrainingBattle>;
  /** Compare-and-set: returns null when another request has already resolved. */
  resolve(battle: TrainingBattle): Promise<TrainingBattle | null>;
}
