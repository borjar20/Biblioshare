import { describe, expect, it } from "vitest";
import {
  dieShapeFor,
  stableColor,
  wheelSectors,
  wheelTargetAngle,
} from "./stage-helpers";

describe("stableColor", () => {
  it("stableColor determinista y dentro de la paleta de asientos", () => {
    expect(stableColor("Rojo")).toBe(stableColor("Rojo"));
    expect(stableColor("Rojo")).toMatch(/^var\(--play-seat-[1-6]\)$/);
  });
});

describe("wheelSectors", () => {
  it("cubre 360 grados sin huecos y con colores de la paleta", () => {
    const s = wheelSectors(["a", "b", "c"]);
    expect(s[0].start).toBe(0);
    expect(s[2].end).toBe(360);
    expect(s[1].start).toBe(s[0].end);
    expect(s.every((x) => /^var\(--play-seat-[1-6]\)$/.test(x.color))).toBe(true);
  });
});

describe("wheelTargetAngle", () => {
  it("deja el centro del sector elegido bajo la flecha", () => {
    const players = ["a", "b", "c", "d"];
    // Sector de "b": 90..180, centro 135. Girar 360-135=225 lo sube arriba.
    expect(wheelTargetAngle(players, "b", 0)).toBe(225);
    expect(wheelTargetAngle(players, "b", 4)).toBe(4 * 360 + 225);
  });
  it("primer sector con centro en 45: gira 315", () => {
    expect(wheelTargetAngle(["a", "b", "c", "d"], "a", 0)).toBe(315);
  });
});

describe("dieShapeFor", () => {
  it("mapea las familias clásicas y el percentil", () => {
    expect(dieShapeFor(4)).toBe("d4");
    expect(dieShapeFor(6)).toBe("d6");
    expect(dieShapeFor(8)).toBe("d8");
    expect(dieShapeFor(10)).toBe("d10");
    expect(dieShapeFor(100)).toBe("d10");
    expect(dieShapeFor(12)).toBe("d12");
    expect(dieShapeFor(20)).toBe("d20");
  });
  it("cualquier otro número de caras cae en round", () => {
    expect(dieShapeFor(2)).toBe("round");
    expect(dieShapeFor(7)).toBe("round");
    expect(dieShapeFor(1000)).toBe("round");
  });
});
