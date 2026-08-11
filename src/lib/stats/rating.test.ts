import { describe, it, expect } from "vitest";
import { starLabel, toStar } from "./rating";

describe("toStar", () => {
  it("cada punto de la escala interna es media estrella", () => {
    expect(toStar(1)).toBe(0.5);
    expect(toStar(2)).toBe(1);
    expect(toStar(6)).toBe(3);
    expect(toStar(9)).toBe(4.5);
    expect(toStar(10)).toBe(5);
  });

  // Esta es la que fallaba antes de la corrección: con `ceil(r/2)`, un 7 daba
  // 4 ★ mientras la media de una sola nota de 7 daba 3,5 ★. La cifra grande y
  // la barra más alta de la misma tarjeta decían cosas distintas.
  it("la conversión concuerda con la media, que divide entre 2", () => {
    for (let r = 1; r <= 10; r++) {
      expect(toStar(r)).toBe(r / 2);
    }
  });

  it("nunca produce un valor que rompa 5 - star", () => {
    for (let r = 1; r <= 10; r++) {
      const star = toStar(r);
      expect(star).toBeGreaterThanOrEqual(0.5);
      expect(star).toBeLessThanOrEqual(5);
      expect(5 - star).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("starLabel", () => {
  it("un decimal siempre, con coma", () => {
    expect(starLabel(3.5)).toBe("3,5");
    expect(starLabel(4)).toBe("4,0");
  });
});
