import type { PetCounts } from "./counts";

// Logros = umbrales sobre contadores que ya existen (spec fase 2 §2). Sin XP,
// sin tabla: desbloqueado ⟺ valor >= umbral. El rastro (y la fecha) es la
// celebración pet_achievement:<id> en user_celebrations.

export const ACHIEVEMENTS = [
  { id: "finished_10", threshold: 10, value: (c: PetCounts) => c.finishedPasses },
  { id: "finished_50", threshold: 50, value: (c: PetCounts) => c.finishedPasses },
  { id: "finished_100", threshold: 100, value: (c: PetCounts) => c.finishedPasses },
  { id: "sessions_100", threshold: 100, value: (c: PetCounts) => c.sessionUnits },
  { id: "episodes_100", threshold: 100, value: (c: PetCounts) => c.episodes },
  { id: "notes_50", threshold: 50, value: (c: PetCounts) => c.notes + c.quotes },
  { id: "reviews_10", threshold: 10, value: (c: PetCounts) => c.reviews },
  { id: "genres_10", threshold: 10, value: (c: PetCounts) => c.distinctGenres },
  { id: "streak_30", threshold: 30, value: (c: PetCounts) => c.bestStreak },
  { id: "streak_100", threshold: 100, value: (c: PetCounts) => c.bestStreak },
  { id: "posts_50", threshold: 50, value: (c: PetCounts) => c.posts },
  { id: "sagas_3", threshold: 3, value: (c: PetCounts) => c.completedSagas },
  { id: "missions_50", threshold: 50, value: (c: PetCounts) => c.missionsCompleted },
  { id: "adult", threshold: 10, value: (_c: PetCounts, level: number) => (level >= 10 ? level : 0) },
  { id: "veteran", threshold: 40, value: (_c: PetCounts, level: number) => (level >= 40 ? level : 0) },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

export function isAchievementId(s: string): s is AchievementId {
  return ACHIEVEMENTS.some((a) => a.id === s);
}

export interface AchievementProgress {
  id: AchievementId;
  value: number;
  threshold: number;
  unlocked: boolean;
}

export function achievementProgress(counts: PetCounts, level: number): AchievementProgress[] {
  return ACHIEVEMENTS.map((a) => {
    const value = a.value(counts, level);
    return { id: a.id, value, threshold: a.threshold, unlocked: value >= a.threshold };
  });
}

export function unlockedAchievements(counts: PetCounts, level: number): AchievementId[] {
  return achievementProgress(counts, level).filter((a) => a.unlocked).map((a) => a.id);
}
