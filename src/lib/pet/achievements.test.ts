import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, achievementProgress, unlockedAchievements } from "./achievements";
import { EMPTY_COUNTS } from "./counts";

describe("achievements", () => {
  it("con cero nada, y el progreso enseña valor y umbral de todos", () => {
    expect(unlockedAchievements(EMPTY_COUNTS, 1)).toEqual([]);
    const p = achievementProgress(EMPTY_COUNTS, 1);
    expect(p).toHaveLength(ACHIEVEMENTS.length);
    expect(p.every((a) => a.value === 0 && a.threshold > 0 && !a.unlocked)).toBe(true);
  });

  it("umbrales: justo debajo no, en el umbral sí", () => {
    expect(unlockedAchievements({ ...EMPTY_COUNTS, finishedPasses: 9 }, 1)).toEqual([]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, finishedPasses: 10 }, 1)).toEqual(["finished_10"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, finishedPasses: 100 }, 1)).toEqual(["finished_10", "finished_50", "finished_100"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, notes: 30, quotes: 20 }, 1)).toEqual(["notes_50"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, bestStreak: 30 }, 1)).toEqual(["streak_30"]);
    expect(unlockedAchievements({ ...EMPTY_COUNTS, missionsCompleted: 50 }, 1)).toEqual(["missions_50"]);
  });

  it("adult y veteran salen del nivel", () => {
    expect(unlockedAchievements(EMPTY_COUNTS, 10)).toEqual(["adult"]);
    expect(unlockedAchievements(EMPTY_COUNTS, 40)).toEqual(["adult", "veteran"]);
  });

  it("ids únicos", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
