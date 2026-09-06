// Perfiles sintéticos (Parte II «Cómo se usa esta parte»): contadores plausibles
// para calibrar sin mirar cuentas reales. Se construyen con deriveAttributes, así
// que si cambia balance.ts cambian con él.
import type { PetClass } from "../classes";
import { EMPTY_COUNTS, type PetCounts } from "../counts";
import { deriveAttributes } from "../derive";
import { buildSnapshot } from "./power";
import type { BattleSnapshot } from "./types";

export const PROFILE_IDS = ["nueva", "importadora", "cinefila", "social", "lectora_larga", "seriefila"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export const SYNTHETIC_PROFILES: Record<ProfileId, { label: string; counts: PetCounts }> = {
  nueva: {
    label: "Recién eclosionada",
    counts: { ...EMPTY_COUNTS, sessionUnits: 2, activeDays: 1 },
  },
  importadora: {
    label: "Importadora de historial",
    counts: { ...EMPTY_COUNTS, historicalPasses: 400, historicalWorks: 400, finishedPasses: 2, activeDays: 5, ratings: 300 },
  },
  cinefila: {
    label: "Espectadora de películas",
    counts: { ...EMPTY_COUNTS, sessionUnits: 120, finishedPasses: 80, distinctGenres: 12, activeDays: 90, notes: 5, ratings: 80, newWorks: 80, newAuthors: 30 },
  },
  social: {
    label: "Usuaria social",
    counts: { ...EMPTY_COUNTS, posts: 150, votes: 300, polls: 10, events: 8, follows: 40, activeDays: 120, finishedPasses: 10, reviews: 12, newWorks: 15 },
  },
  lectora_larga: {
    label: "Lectora de libros largos",
    counts: { ...EMPTY_COUNTS, sessionUnits: 400, activeDays: 200, dailyGoalDays: 120, streakMilestones: 6, finishedPasses: 30, completedSagas: 2, distinctGenres: 8, notes: 40, quotes: 20, reviews: 10, ratings: 30, posts: 5, follows: 3, newWorks: 35, newAuthors: 20 },
  },
  seriefila: {
    label: "Consumidora de series",
    counts: { ...EMPTY_COUNTS, episodes: 600, activeDays: 150, dailyGoalDays: 40, finishedPasses: 15, distinctGenres: 6, ratings: 15, newWorks: 20 },
  },
};

export function snapshotForProfile(id: ProfileId, petClass: PetClass): BattleSnapshot {
  const profile = SYNTHETIC_PROFILES[id];
  return buildSnapshot({ name: profile.label, petClass, stage: "adult", attributes: deriveAttributes(profile.counts) });
}
