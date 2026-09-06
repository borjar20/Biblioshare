import { describe, expect, it } from "vitest";
import { minigameInstance, scoreAssignment } from "./minigame";
import { seedFromIndex } from "./prng";

const seed = seedFromIndex(7);

describe("minigameInstance", () => {
  it("misma (seed, tick, familia) → misma instancia; otro tick → otra", () => {
    expect(minigameInstance(seed, 120, "A")).toEqual(minigameInstance(seed, 120, "A"));
    expect(new Set(Array.from({ length: 20 }, (_, t) => minigameInstance(seed, 100 + t, "A").solution.join(""))).size).toBeGreaterThan(1);
    expect(Array.from({ length: 20 }, (_, t) => minigameInstance(seed, 100 + t, "B").solution.join(""))).not.toEqual(Array.from({ length: 20 }, (_, t) => minigameInstance(seed, 100 + t, "A").solution.join("")));
  });

  it("tokens y solution son permutaciones de 0..k−1, k entre 2 y 4", () => {
    const inst = minigameInstance(seed, 40, "B", 3);
    expect([...inst.tokens].sort()).toEqual([0, 1, 2]);
    expect([...inst.solution].sort()).toEqual([0, 1, 2]);
    expect(minigameInstance(seed, 40, "A").tokens).toHaveLength(4);
    expect(() => minigameInstance(seed, 40, "A", 5)).toThrow("MINIGAME_K");
    expect(() => minigameInstance(seed, 40, "A", 1)).toThrow("MINIGAME_K");
  });

  it("scoreAssignment cuenta huecos acertados; la asignación viaja, la puntuación no", () => {
    const inst = minigameInstance(seed, 40, "A");
    expect(scoreAssignment(inst, inst.solution)).toBe(4);
    expect(scoreAssignment(inst, inst.solution.map((s) => (s + 1) % 4))).toBe(0);
    expect(() => scoreAssignment(inst, [0, 1])).toThrow("MINIGAME_ASSIGNMENT");
    expect(() => scoreAssignment(inst, [0, 0, 1, 2])).toThrow("MINIGAME_ASSIGNMENT");
  });
});
