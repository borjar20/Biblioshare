import { describe, expect, it } from "vitest";
import { brandMarkGeom } from "./brand-mark-geometry";

describe("brandMarkGeom", () => {
  it("reproduce las medidas del mockup a 120px", () => {
    const g = brandMarkGeom(120);
    expect(g.gap).toBe(12);
    expect(g.spines.map((s) => s.width)).toEqual([24, 24, 24]);
    expect(g.spines.map((s) => s.height)).toEqual([82, 120, 60]);
    expect(g.spines[0].radiusTop).toBe(6);
    expect(g.spines[0].radiusBottom).toBe(3);
  });

  it("escala proporcionalmente a otros tamaños", () => {
    const g = brandMarkGeom(60);
    expect(g.gap).toBe(6);
    expect(g.spines.map((s) => s.width)).toEqual([12, 12, 12]);
    expect(g.spines.map((s) => s.height)).toEqual([41, 60, 30]);
    expect(g.spines[1].radiusTop).toBe(3);
    expect(g.spines[1].radiusBottom).toBe(1.5);
  });
});
