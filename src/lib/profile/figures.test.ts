import { describe, expect, it } from "vitest";
import { formatAverage, summarizeRatings } from "./figures";

describe("summarizeRatings", () => {
  it("media sobre 10 con 3 o más notas", () => {
    expect(summarizeRatings([8, 9, 10])).toEqual({ average: 9, count: 3 });
  });
  it("con menos de 3 notas no hay media", () => {
    expect(summarizeRatings([10, 10])).toEqual({ average: null, count: 2 });
  });
  it("sin notas", () => {
    expect(summarizeRatings([])).toEqual({ average: null, count: 0 });
  });
});

describe("formatAverage", () => {
  it("pasa a escala de 5 con una decimal y coma", () => {
    expect(formatAverage(9)).toBe("4,5");
    expect(formatAverage(8)).toBe("4");
    expect(formatAverage(7.3)).toBe("3,7");
  });
});
