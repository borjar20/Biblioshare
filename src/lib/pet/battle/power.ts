// Poder de combate (contrato C7, #1081 R6): magnitud interna SIN bonus de clase.
// El nivel visible (xpFor + levelFor) no se toca (Parte I §2.3); esto escala al
// enemigo y nada más. No se guarda: se deriva al crear el combate y viaja en el
// snapshot.
import { PET_ATTRIBUTES, type PetAttributes, type PetClass, type PetStage } from "../classes";
import { levelFor } from "../derive";
import type { BattleSnapshot } from "./types";

export function combatPower(attrs: PetAttributes): number {
  let power = 0;
  for (const key of PET_ATTRIBUTES) power += Math.max(0, Math.round(attrs[key]));
  return power;
}

/** Misma curva que el nivel (levelFor) sobre el poder sin bonus. */
export function powerTier(attrs: PetAttributes): number {
  return levelFor(combatPower(attrs));
}

export function fighterStats(tier: number): { hpMax: number; atk: number } {
  return { hpMax: 100 + 10 * tier, atk: 8 + 2 * tier };
}

export { enemyStats } from "./versions/r4.1/power";

export function buildSnapshot(p: {
  name: string;
  petClass: PetClass;
  stage: PetStage;
  attributes: PetAttributes;
}): BattleSnapshot {
  const tier = powerTier(p.attributes);
  const { hpMax, atk } = fighterStats(tier);
  return { name: p.name, petClass: p.petClass, stage: p.stage, attributes: { ...p.attributes }, tier, hpMax, atk };
}
