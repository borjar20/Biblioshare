// EL ÚNICO sitio con números del combate (como balance.ts para la progresión).
// Contrato C6 del plan R1. Cambiar cualquiera = subir `version` y regenerar el
// ejemplo normativo: el contentHash cambia y normative.test.ts lo dice.
import { canonicalJson } from "./canonical";
import { sha256Hex } from "./hash";
import type { EnemyDef, Ruleset } from "./types";

export const RULESET: Ruleset = {
  version: "r2.1",
  tickMs: 100,
  maxTicks: 600,
  maxInputs: 64,
  pet: {
    basicInterval: 15,
    skillCooldown: 90,
    skillIdleMul: 2,
    skillInterruptMul: 4,
    guardBasicDiv: 4,
  },
};

/** El enemigo de R2: dos anuncios contrarios (§4.3). Carga que conviene
 *  interrumpir, guardia durante la que conviene esperar. */
export const BROTE: EnemyDef = {
  id: "brote",
  name: "Brote de zarza",
  hpPerAtk: 42,
  basicPct: 4,
  chargePct: 40,
  punishPct: 25,
  chargeBp: 5000,
  idleMin: 20,
  idleMax: 40,
  windupTicks: 15,
  guardTicks: 25,
  staggerTicks: 20,
  basicInterval: 20,
};

export const ENEMIES: Record<string, EnemyDef> = { [BROTE.id]: BROTE };

/** Hash del contenido con el que se simula; se guarda con cada combate (C9). */
export function contentHash(): Promise<string> {
  return sha256Hex(canonicalJson({ ruleset: RULESET, enemies: ENEMIES }));
}
