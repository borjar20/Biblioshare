import { nextInt, subStream } from "@/lib/pet/battle/prng";
import { LOOT_ITEMS, type LootSlot, type LootItemId, type Reward } from "./catalog";

export interface InventoryEntry { itemId: LootItemId; slot: LootSlot; count: number }

/** Permutación de los seis, derivada del seed de la aventura (sub-flujo propio, como el puzzle). */
export function rewardOrder(seed: string): Reward[] {
  const rng = subStream(seed, "loot:reward", 0);
  const order = LOOT_ITEMS.map((i) => ({ itemId: i.id, slot: i.slot }));
  for (let i = order.length - 1; i > 0; i--) { const j = nextInt(rng, 0, i); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

/** La misma regla que resolve_pet_adventure en SQL: primer no poseído; si todo, el primero. */
export function pickReward(order: readonly Reward[], owned: Iterable<string>): Reward {
  const has = new Set(owned);
  return order.find((r) => !has.has(r.itemId)) ?? order[0];
}

export function inventoryFrom(rewards: ReadonlyArray<Reward | null | undefined>): InventoryEntry[] {
  const counts = new Map<string, number>();
  for (const r of rewards) if (r) counts.set(r.itemId, (counts.get(r.itemId) ?? 0) + 1);
  return LOOT_ITEMS.filter((i) => counts.has(i.id)).map((i) => ({ itemId: i.id, slot: i.slot, count: counts.get(i.id)! }));
}
