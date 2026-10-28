import { describe, expect, it } from "vitest";
import { arcChainPath } from "./backdrop-shared";

describe("arcChainPath", () => {
  it("en horizontal arquea hacia arriba, con altura 0,25 de la distancia", () => {
    // Distancia 400 → flecha de 100 → punto de control a 200 sobre el eje (la cuadrática sube la mitad).
    expect(arcChainPath([{ x: 0, y: 0 }, { x: 400, y: 0 }], "h")).toBe("M 0 0 Q 200 -200 400 0");
  });

  it("en vertical arquea hacia el lado (x negativa)", () => {
    expect(arcChainPath([{ x: 0, y: 0 }, { x: 0, y: 400 }], "v")).toBe("M 0 0 Q -200 200 0 400");
  });

  it("un salto largo se arquea mucho más que uno corto, con tope", () => {
    const peak = (d: number) => Math.abs(Number(arcChainPath([{ x: 0, y: 0 }, { x: d, y: 0 }], "h").split(" ")[5])) / 2;
    expect(peak(400)).toBeGreaterThan(peak(100));
    expect(peak(10000)).toBe(peak(20000));
  });

  it("encadena un arco por tramo y no dibuja nada con menos de dos puntos ni entre puntos iguales", () => {
    const d = arcChainPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 0 }], "h");
    expect(d.match(/Q/g)).toHaveLength(2);
    expect(arcChainPath([{ x: 0, y: 0 }], "h")).toBe("");
    expect(arcChainPath([{ x: 5, y: 5 }, { x: 5, y: 5 }], "h")).toBe("");
  });
});
