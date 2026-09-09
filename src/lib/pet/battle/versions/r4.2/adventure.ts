// Cadena de una aventura (spec R4a §3): los enemigos de cada tramo salen de un
// sub-flujo propio del seed, no del PRNG del combate. Uniforme, con repetición.
import { nextInt, subStream } from "./prng";
import type { EnemyDef } from "./types";

export function pickEnemies(seed: string, count: number, pool: Record<string, EnemyDef>): EnemyDef[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("BAD_CHAIN");
  const ids = Object.keys(pool).sort();
  if (ids.length === 0) throw new Error("NO_ENEMIES");
  const rng = subStream(seed, "r4.1:adventure", 0);
  const out: EnemyDef[] = [];
  for (let i = 0; i < count; i++) out.push(pool[ids[nextInt(rng, 0, ids.length - 1)]]);
  return out;
}

/** Lo que se guarda en pet_battles.enemy_id: ids separados por coma, en orden de tramo. */
export function enemyList(enemies: readonly EnemyDef[]): string {
  return enemies.map((e) => e.id).join(",");
}

export function parseEnemyList(list: string, pool: Record<string, EnemyDef>): EnemyDef[] | null {
  const out: EnemyDef[] = [];
  for (const id of list.split(",")) {
    if (!Object.hasOwn(pool, id)) return null;
    out.push(pool[id]);
  }
  return out;
}
