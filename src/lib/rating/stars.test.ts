import { describe, expect, it } from "vitest";
import { fromStars, toStars, formatStars } from "./stars";

describe("toStars", () => {
  it("convierte 1-10 a medias estrellas", () => {
    expect(toStars(10)).toBe(5);
    expect(toStars(9)).toBe(4.5);
    expect(toStars(1)).toBe(0.5);
  });

  it("mantiene null", () => {
    expect(toStars(null)).toBeNull();
  });
});

describe("fromStars", () => {
  it("es la inversa exacta", () => {
    for (let r = 1; r <= 10; r++) expect(fromStars(toStars(r)!)).toBe(r);
  });

  it("recorta fuera de rango", () => {
    expect(fromStars(0)).toBe(1);
    expect(fromStars(7)).toBe(10);
  });
});

describe("formatStars", () => {
  it("usa coma decimal", () => {
    expect(formatStars(9)).toBe("4,5");
    expect(formatStars(8)).toBe("4");
    expect(formatStars(null)).toBeNull();
  });
});
