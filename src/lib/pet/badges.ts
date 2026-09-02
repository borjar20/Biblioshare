import { ACHIEVEMENT_FAMILIES, type AchievementFamily } from "./achievements";

// Una insignia por familia (spec logros-niveles §3). Los PNG los genera
// scripts/pet-badges.mjs; el arte IA curado los sustituye CON LOS MISMOS
// NOMBRES. badges.test.ts comprueba que cada fichero existe.
export const BADGE_SIZE = 32;

export const BADGE_MANIFEST: Record<AchievementFamily, string> = Object.fromEntries(
  ACHIEVEMENT_FAMILIES.map((f) => [f, `/pet/badges/${f}.png`]),
) as Record<AchievementFamily, string>;
