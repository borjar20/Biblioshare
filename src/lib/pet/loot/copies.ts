import { isReward } from "./catalog";
import type { LootCopy } from "./types";
export { isQualityBp } from "./catalog";

/** A won battle is the identity of one copy; historical rewards are never rewritten. */
export function copyFromWin(row: { id: string; reward: unknown; resolved_at: string | null }): LootCopy | null {
  if (!row.resolved_at || !isReward(row.reward)) return null;
  return { copyId: row.id, acquiredAt: row.resolved_at, itemId: row.reward.itemId,
    slot: row.reward.slot, qualityBp: row.reward.qualityBp ?? 10000 };
}
