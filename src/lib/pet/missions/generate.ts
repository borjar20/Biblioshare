import { PET_ATTRIBUTES, type PetAttribute, type PetAttributes } from "../classes";
import {
  MISSION_ATTR,
  MISSION_COST,
  MISSION_TEMPLATES,
  missionTarget,
  missionXp,
  type MissionTemplate,
} from "./templates";

// Generación PURA de las tres misiones del día (spec fase 2 §1.3). Quien llama
// trae el seed (userId + día), el primario, los atributos y qué es elegible.

export interface MissionCandidate {
  itemType: string;
  itemId: string;
  title: string;
}

export interface MissionEligibility {
  hasClub: boolean;
  hasOpenSeries: boolean;
  /** `profiles.daily_goal_minutes`, null si no hay objetivo. */
  dailyGoal: number | null;
  /** Pase a punto de acabar (libro >= 70 % o serie con <= 2 episodios), o null. */
  finishCandidate: MissionCandidate | null;
  /** Terminado en los últimos 7 días sin reseña, o null. */
  reviewCandidate: MissionCandidate | null;
}

export interface MissionPick {
  template: MissionTemplate;
  target: number;
  xp: number;
  itemType?: string;
  itemId?: string;
  title?: string;
}

/** FNV-1a de 32 bits: determinista, sin dependencias. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Plantillas que tienen sentido HOY para este usuario (spec §1.2), en el orden de MISSION_TEMPLATES. */
export function eligibleTemplates(e: MissionEligibility): MissionTemplate[] {
  return MISSION_TEMPLATES.filter((t) => {
    switch (t) {
      case "daily_goal":
        return e.dailyGoal != null && e.dailyGoal > 0;
      case "post":
      case "vote":
        return e.hasClub;
      case "episodes":
        return e.hasOpenSeries;
      case "finish_pass":
        return e.finishCandidate != null;
      case "review":
        return e.reviewCandidate != null;
      default:
        return true;
    }
  });
}

function makeRng(seed: string): () => number {
  // xorshift32 sembrado con FNV-1a; devuelve enteros no negativos.
  let x = hashSeed(seed) || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

function toPick(t: MissionTemplate, e: MissionEligibility): MissionPick {
  const base: MissionPick = { template: t, target: missionTarget(t, e.dailyGoal), xp: missionXp(t) };
  const c = t === "finish_pass" ? e.finishCandidate : t === "review" ? e.reviewCandidate : null;
  return c ? { ...base, itemType: c.itemType, itemId: c.itemId, title: c.title } : base;
}

export function pickDailyMissions(
  seed: string,
  primary: PetAttribute,
  attributes: PetAttributes,
  eligibility: MissionEligibility,
): MissionPick[] {
  const rng = makeRng(seed);
  const eligible = eligibleTemplates(eligibility);
  const usedTemplates = new Set<MissionTemplate>();
  const usedAttrs = new Set<PetAttribute>();
  const picks: MissionPick[] = [];

  const pool = (attr: PetAttribute, costs: readonly ("light" | "medium" | "hard")[]) =>
    eligible.filter((t) => MISSION_ATTR[t] === attr && costs.includes(MISSION_COST[t]) && !usedTemplates.has(t));

  const take = (candidates: MissionTemplate[]) => {
    const t = candidates[rng() % candidates.length];
    usedTemplates.add(t);
    usedAttrs.add(MISSION_ATTR[t]);
    picks.push(toPick(t, eligibility));
  };

  // Hueco 0 y 1: un atributo preferido; si no tiene plantilla elegible, el
  // siguiente del orden de PET_ATTRIBUTES que sí tenga (spec §1.3).
  const fillFrom = (preferred: PetAttribute[], costs: readonly ("light" | "medium")[]) => {
    for (const attr of preferred) {
      if (usedAttrs.has(attr)) continue;
      const c = pool(attr, costs);
      if (c.length > 0) {
        take(c);
        return;
      }
    }
  };

  const order = [...PET_ATTRIBUTES];
  // Hueco 0: primario.
  fillFrom([primary, ...order.filter((a) => a !== primary)], ["light", "medium"]);

  // Hueco 1: el más flojo distinto del primario (empate: orden de la tabla).
  const weakestFirst = order
    .filter((a) => a !== primary)
    .sort((a, b) => attributes[a] - attributes[b] || order.indexOf(a) - order.indexOf(b));
  fillFrom(weakestFirst, ["light", "medium"]);

  // Hueco 2: azar entre atributos no usados; dura si hay alguna elegible.
  const free = order.filter((a) => !usedAttrs.has(a));
  const hard = free.flatMap((a) => pool(a, ["hard"]));
  if (hard.length > 0) take(hard);
  else {
    const medium = free.flatMap((a) => pool(a, ["medium"]));
    if (medium.length > 0) take(medium);
    else {
      const light = free.flatMap((a) => pool(a, ["light"]));
      if (light.length > 0) take(light);
    }
  }

  // Red de seguridad: si algún hueco quedó vacío (elegibilidad mínima), rellena
  // con cualquier plantilla no usada, aunque repita atributo. Se cree
  // inalcanzable: las plantillas siempre elegibles (rating, new_work,
  // any_activity, session_minutes) cubren cuatro atributos distintos (SAB,
  // DES, CON, FUE), así que huecos 0/1/2 nunca deberían quedarse sin
  // candidata; se mantiene solo como guarda.
  while (picks.length < 3) {
    const rest = eligible.filter((t) => !usedTemplates.has(t) && MISSION_COST[t] !== "hard");
    if (rest.length === 0) break;
    take(rest);
  }
  return picks;
}
