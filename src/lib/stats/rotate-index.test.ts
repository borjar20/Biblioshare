import { describe, it, expect } from "vitest";
import { rotateIndex } from "./rotate-index";

describe("rotateIndex", () => {
  it("avanza al siguiente índice", () => {
    expect(rotateIndex(0, 3)).toBe(1);
    expect(rotateIndex(1, 3)).toBe(2);
  });
  it("da la vuelta al llegar al final", () => {
    expect(rotateIndex(2, 3)).toBe(0);
  });
  it("con un solo elemento se queda en 0", () => {
    expect(rotateIndex(0, 1)).toBe(0);
  });
  it("con lista vacía devuelve 0 (sin división por cero)", () => {
    expect(rotateIndex(0, 0)).toBe(0);
  });
});
