import type { BattleEvent } from "@/lib/pet/battle/versions/r4.2/types";
export type LootEffect = Extract<BattleEvent, { type:"LOOT_EFFECT" }>;

/** Keep the last activation readable independently from the short animated burst. */
export function lootFeedbackForTick(events: readonly BattleEvent[], tick: number, minTick = 0): LootEffect[] {
  const latest = events.findLast(event => event.type === "LOOT_EFFECT" && event.tick >= minTick && event.tick <= tick);
  return latest ? events.filter((event): event is LootEffect => event.type === "LOOT_EFFECT" && event.tick === latest.tick) : [];
}

/** Call only for the visible tick, after resume has reconstructed the historical log. */
export function lootEffectsForTick(events: readonly BattleEvent[], tick = events.at(-1)?.tick ?? 0, minTick = 0): LootEffect[] {
  return events.filter((event): event is LootEffect => event.type === "LOOT_EFFECT" && event.tick >= minTick && event.tick <= tick && tick - event.tick < 9);
}
