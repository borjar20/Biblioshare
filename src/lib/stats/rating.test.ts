import { describe, it, expect } from "vitest";
import { toStar } from "./rating";

describe("toStar", () => {
  it("mapea la escala 1–10 a 1–5", () => {
    expect(toStar(1)).toBe(1);
    expect(toStar(2)).toBe(1);
    expect(toStar(6)).toBe(3);
    expect(toStar(9)).toBe(5);
    expect(toStar(10)).toBe(5);
  });
  it("nunca produce un valor que rompa 5 - star", () => {
    for (let r = 1; r <= 10; r++) {
      const star = toStar(r);
      expect(star).toBeGreaterThanOrEqual(1);
      expect(star).toBeLessThanOrEqual(5);
      expect(5 - star).toBeGreaterThanOrEqual(0);
    }
  });
});
