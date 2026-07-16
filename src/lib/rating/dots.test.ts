import { describe, it, expect } from "vitest";
import { toDots, formatDots } from "./dots";

describe("toDots", () => {
  it("convierte la nota 1-10 a la escala de 5 dots", () => {
    expect(toDots(10)).toBe(5);
    expect(toDots(9)).toBe(4.5);
    expect(toDots(1)).toBe(0.5);
  });

  it("propaga la ausencia de nota", () => {
    expect(toDots(null)).toBeNull();
  });
});

describe("formatDots", () => {
  it("formatea en es-ES con una decimal como mucho", () => {
    expect(formatDots(9)).toBe("4,5");
    expect(formatDots(8)).toBe("4");
    expect(formatDots(null)).toBeNull();
  });
});
