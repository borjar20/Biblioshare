// EL ÚNICO sitio con números del combate (como balance.ts para la progresión).
// Contrato C6 del plan R1. Cambiar cualquiera = subir `version` y regenerar el
// ejemplo normativo: el contentHash cambia y normative.test.ts lo dice.
import { canonicalJson } from "./canonical";
import { sha256Hex } from "./hash";
import type { EnemyDef, Ruleset } from "./types";

export const RULESET: Ruleset = {
  version: "r4.2",
  tickMs: 100,
  maxTicks: 600,
  maxInputs: 64,
  ulti: { readyAt: 120, baseMul: 4, powerMul: 2, shieldPct: 20 },
  pet: {
    basicInterval: 15,
    skillCooldown: 60,
    skillIdleMul: 2,
    skillInterruptMul: 4,
    guardBasicDiv: 4,
  },
  adventure: { chainLength: 3 },
  loot: { interruptPct: 25, powerPct: 50, vulnerabilityTicks: 10, ultiShieldPct: 5, cooldownTicks: 10, healPct: 10 },
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

export const CAPARAZON: EnemyDef = { ...BROTE, id: "caparazon", name: "Escarabajo coraza", chargeBp: 0, vulnerableTicks: 25 };

export const ENEMIES: Record<string, EnemyDef> = { [BROTE.id]: BROTE, [CAPARAZON.id]: CAPARAZON };

// Released values must not change through shared references.
Object.freeze(RULESET.ulti);
Object.freeze(RULESET.loot);
Object.freeze(CAPARAZON);
Object.freeze(RULESET.pet);
Object.freeze(RULESET.adventure);
Object.freeze(RULESET);
Object.freeze(BROTE);
Object.freeze(ENEMIES);

/** Hash del contenido con el que se simula; se guarda con cada combate (C9). */
export function contentHash(): Promise<string> {
  return sha256Hex(canonicalJson({ ruleset: RULESET, enemies: ENEMIES }));
}
