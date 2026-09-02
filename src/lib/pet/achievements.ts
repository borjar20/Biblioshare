import { BALANCE } from "./balance";
import type { PetCounts } from "./counts";

// Logros por FAMILIAS con escalera abierta (spec logros-niveles §1). Sin XP,
// sin tabla: nivel = f(valor) y el rastro (con fecha por nivel) es la
// celebración pet_achievement:<familia>:<tier>. Todo puro.

export type Ladder = { steps: readonly number[]; then: number | null };

export type AchievementFamily = keyof typeof BALANCE.achievements;

export const ACHIEVEMENT_FAMILIES = Object.keys(BALANCE.achievements) as AchievementFamily[];

export function isAchievementFamily(s: string): s is AchievementFamily {
  return Object.prototype.hasOwnProperty.call(BALANCE.achievements, s);
}

export function ladderFor(family: AchievementFamily): Ladder {
  return BALANCE.achievements[family];
}

/** Qué mide cada familia. `stage` lee el nivel de la mascota, no PetCounts. */
const VALUE_OF: Record<AchievementFamily, (c: PetCounts, level: number) => number> = {
  finished: (c) => c.finishedPasses,
  sessions: (c) => c.sessionUnits,
  episodes: (c) => c.episodes,
  notes: (c) => c.notes + c.quotes,
  reviews: (c) => c.reviews,
  genres: (c) => c.distinctGenres,
  streak: (c) => c.bestStreak,
  posts: (c) => c.posts,
  sagas: (c) => c.completedSagas,
  missions: (c) => c.missionsCompleted,
  stage: (_c, level) => level,
};

/** Umbral del nivel `tier` (>= 1). Más allá de `steps`: último + then × exceso. Cerrada fuera de rango: null. */
export function thresholdFor(ladder: Ladder, tier: number): number | null {
  if (!Number.isInteger(tier) || tier < 1) return null;
  if (tier <= ladder.steps.length) return ladder.steps[tier - 1];
  if (ladder.then == null) return null;
  return ladder.steps[ladder.steps.length - 1] + ladder.then * (tier - ladder.steps.length);
}

/** Mayor nivel cuyo umbral <= value. 0 = ninguno. Termina porque los umbrales crecen. */
export function tierFor(ladder: Ladder, value: number): number {
  let tier = 0;
  for (;;) {
    const next = thresholdFor(ladder, tier + 1);
    if (next == null || value < next) return tier;
    tier++;
  }
}

export interface FamilyProgress {
  family: AchievementFamily;
  value: number;
  tier: number;
  /** Umbral del nivel actual; null con nivel 0. */
  threshold: number | null;
  /** Umbral del siguiente nivel; null si la escalera está cerrada y completa. */
  nextThreshold: number | null;
}

export function familyProgress(counts: PetCounts, level: number): FamilyProgress[] {
  return ACHIEVEMENT_FAMILIES.map((family) => {
    const ladder = ladderFor(family);
    const value = VALUE_OF[family](counts, level);
    const tier = tierFor(ladder, value);
    return { family, value, tier, threshold: thresholdFor(ladder, tier), nextThreshold: thresholdFor(ladder, tier + 1) };
  });
}

/** `payload.key` de la celebración: "<familia>:<tier>". */
export function achievementKey(family: AchievementFamily, tier: number): string {
  return `${family}:${tier}`;
}

/** Lee `user_celebrations.event_key` ("pet_achievement:<familia>:<tier>"). Cualquier otra forma → null (fail-closed). */
export function parseAchievementKey(eventKey: string): { family: AchievementFamily; tier: number } | null {
  const m = /^pet_achievement:([a-z]+):(\d+)$/.exec(eventKey);
  if (!m) return null;
  const [, family, tierRaw] = m;
  const tier = Number(tierRaw);
  if (!isAchievementFamily(family) || !Number.isInteger(tier) || tier < 1) return null;
  return { family, tier };
}

export interface EarnPlan {
  family: AchievementFamily;
  tier: number;
  /** = achievementKey(family, tier) */
  key: string;
  /** true solo para el nivel más alto nuevo de la familia, y nunca en backfill. */
  animate: boolean;
}

/** Qué niveles ganar en esta lectura: todos los 1..tier que no estén en `earnedKeys`. */
export function planAchievementEarns(
  progress: FamilyProgress[],
  earnedKeys: ReadonlySet<string>,
  backfill: boolean,
): EarnPlan[] {
  const plan: EarnPlan[] = [];
  for (const p of progress) {
    for (let tier = 1; tier <= p.tier; tier++) {
      const key = achievementKey(p.family, tier);
      if (earnedKeys.has(key)) continue;
      plan.push({ family: p.family, tier, key, animate: !backfill && tier === p.tier });
    }
  }
  return plan;
}
