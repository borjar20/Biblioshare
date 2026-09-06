import type { BattleEvent } from "@/lib/pet/battle/types";

/** Visual effects use the whole latest tick; a status event cannot hide a hit. */
export function trainingEffects(events: readonly BattleEvent[]) {
  const tick = events.at(-1)?.tick;
  const batch = events.filter(event => event.tick === tick);
  const strike = batch.findLast(event => event.type === "PET_BASIC" || event.type === "SKILL_USED");
  const enemyHit = batch.findLast(event => (event.type === "PET_BASIC" || event.type === "SKILL_USED") && event.damage > 0);
  const petHit = batch.findLast(event => ((event.type === "ENEMY_BASIC" || event.type === "TELEGRAPH_RESOLVED") && event.damage > 0)
    || (event.type === "SKILL_USED" && event.effect === "wasted"));
  return { strike: strike?.seq, enemyHit: enemyHit?.seq, petHit: petHit?.seq };
}
