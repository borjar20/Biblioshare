import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_FAMILIES,
  achievementKey,
  familyProgress,
  ladderFor,
  parseAchievementKey,
  planAchievementEarns,
  thresholdFor,
  tierFor,
  type Ladder,
} from "./achievements";
import { BALANCE } from "./balance";
import { EMPTY_COUNTS } from "./counts";

const posts: Ladder = { steps: [50, 100, 150, 300], then: 300 };
const stage: Ladder = { steps: [10, 40], then: null };

describe("thresholdFor", () => {
  it("dentro de steps devuelve el paso; más allá suma `then` por nivel", () => {
    expect(thresholdFor(posts, 1)).toBe(50);
    expect(thresholdFor(posts, 4)).toBe(300);
    expect(thresholdFor(posts, 5)).toBe(600);
    expect(thresholdFor(posts, 7)).toBe(1200);
  });
  it("cerrada: null fuera de steps; tier 0 o negativo o no entero: null", () => {
    expect(thresholdFor(stage, 2)).toBe(40);
    expect(thresholdFor(stage, 3)).toBeNull();
    expect(thresholdFor(posts, 0)).toBeNull();
    expect(thresholdFor(posts, -1)).toBeNull();
    expect(thresholdFor(posts, 1.5)).toBeNull();
  });
  it("`then` no positivo más allá de steps se trata como cerrada", () => {
    expect(thresholdFor({ steps: [10], then: 0 }, 2)).toBeNull();
  });
});

describe("tierFor", () => {
  it("valor = umbral exacto sube de nivel; entre pasos se queda; más allá de steps sigue", () => {
    expect(tierFor(posts, 0)).toBe(0);
    expect(tierFor(posts, 49)).toBe(0);
    expect(tierFor(posts, 50)).toBe(1);
    expect(tierFor(posts, 160)).toBe(3);
    expect(tierFor(posts, 300)).toBe(4);
    expect(tierFor(posts, 899)).toBe(5);
    expect(tierFor(posts, 900)).toBe(6);
  });
  it("cerrada topa en el último paso", () => {
    expect(tierFor(stage, 9)).toBe(0);
    expect(tierFor(stage, 10)).toBe(1);
    expect(tierFor(stage, 40)).toBe(2);
    expect(tierFor(stage, 10_000)).toBe(2);
  });
  it("escalera degenerada (`then` no positivo) se cierra en vez de colgarse", () => {
    expect(tierFor({ steps: [10], then: 0 }, 1e9)).toBe(1);
    expect(tierFor({ steps: [10], then: -5 }, 1e9)).toBe(1);
  });
  it("valor no finito nunca sube de nivel", () => {
    expect(tierFor(posts, Number.NaN)).toBe(0);
  });
});

describe("escaleras del balance", () => {
  it("todas las familias tienen escalera creciente y `then` nulo o positivo", () => {
    for (const f of ACHIEVEMENT_FAMILIES) {
      const l = ladderFor(f);
      expect(l.steps.length, f).toBeGreaterThan(0);
      for (let i = 1; i < l.steps.length; i++) expect(l.steps[i], f).toBeGreaterThan(l.steps[i - 1]);
      if (l.then != null) expect(l.then, f).toBeGreaterThan(0);
    }
    expect(ACHIEVEMENT_FAMILIES).toEqual(Object.keys(BALANCE.achievements));
  });
});

describe("familyProgress", () => {
  it("con cero todo es nivel 0 y el siguiente umbral es el primer paso", () => {
    const p = familyProgress(EMPTY_COUNTS, 1);
    expect(p).toHaveLength(ACHIEVEMENT_FAMILIES.length);
    for (const f of p) {
      expect(f.tier).toBe(0);
      expect(f.threshold).toBeNull();
      expect(f.nextThreshold).toBe(ladderFor(f.family).steps[0]);
    }
  });
  it("posts 160 → nivel 3 (150), siguiente 300; stage a nivel 40 → completa", () => {
    const p = familyProgress({ ...EMPTY_COUNTS, posts: 160 }, 40);
    const posts = p.find((f) => f.family === "posts")!;
    expect(posts).toMatchObject({ value: 160, tier: 3, threshold: 150, nextThreshold: 300 });
    const stage = p.find((f) => f.family === "stage")!;
    expect(stage).toMatchObject({ value: 40, tier: 2, threshold: 40, nextThreshold: null });
  });
  it("notas suma notas y citas; streak lee bestStreak", () => {
    const p = familyProgress({ ...EMPTY_COUNTS, notes: 30, quotes: 20, bestStreak: 100 }, 1);
    expect(p.find((f) => f.family === "notes")!.tier).toBe(1);
    expect(p.find((f) => f.family === "streak")!.tier).toBe(2);
  });
});

describe("claves", () => {
  it("achievementKey y parseAchievementKey son inversas; claves viejas o basura → null", () => {
    expect(achievementKey("posts", 3)).toBe("posts:3");
    expect(parseAchievementKey("pet_achievement:posts:3")).toEqual({ family: "posts", tier: 3 });
    expect(parseAchievementKey("pet_achievement:finished_10")).toBeNull();
    expect(parseAchievementKey("pet_achievement:nope:1")).toBeNull();
    expect(parseAchievementKey("pet_achievement:posts:0")).toBeNull();
    expect(parseAchievementKey("pet_achievement:posts:x")).toBeNull();
    expect(parseAchievementKey("streak_milestone:30")).toBeNull();
  });
});

describe("planAchievementEarns", () => {
  it("gana todos los niveles que faltan y anima solo el más alto de cada familia", () => {
    const progress = familyProgress({ ...EMPTY_COUNTS, posts: 160, reviews: 10 }, 1);
    const plan = planAchievementEarns(progress, new Set(["posts:1"]), false);
    expect(plan.map((e) => `${e.key}:${e.animate}`).sort()).toEqual(["posts:2:false", "posts:3:true", "reviews:1:true"].sort());
  });
  it("en backfill no anima nada", () => {
    const progress = familyProgress({ ...EMPTY_COUNTS, posts: 160 }, 1);
    const plan = planAchievementEarns(progress, new Set(), true);
    expect(plan).toHaveLength(3);
    expect(plan.every((e) => !e.animate)).toBe(true);
  });
  it("sin novedades no gana nada", () => {
    const progress = familyProgress({ ...EMPTY_COUNTS, posts: 160 }, 1);
    expect(planAchievementEarns(progress, new Set(["posts:1", "posts:2", "posts:3"]), false)).toEqual([]);
  });
});
