import type { EnemyDef } from "./types";

/** El enemigo se mide contra la mascota: vida en múltiplos de su atk, golpes en % de su vida. */
export function enemyStats(
  enemy: EnemyDef,
  pet: { hpMax: number; atk: number },
): { hpMax: number; basic: number; charge: number; punish: number } {
  return {
    hpMax: enemy.hpPerAtk * pet.atk,
    basic: Math.floor((pet.hpMax * enemy.basicPct) / 100),
    charge: Math.floor((pet.hpMax * enemy.chargePct) / 100),
    punish: Math.floor((pet.hpMax * enemy.punishPct) / 100),
  };
}

