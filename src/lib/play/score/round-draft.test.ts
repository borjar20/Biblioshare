import { describe, expect, it } from "vitest";
import { applyDelta } from "./round-draft";

describe("applyDelta", () => {
  it("suma al asiento indicado y no toca los demás", () => {
    expect(applyDelta([0, 0, 0], 1, 5)).toEqual([0, 5, 0]);
  });
  it("admite negativos: una ronda puede restar", () => {
    expect(applyDelta([3, 0], 0, -10)).toEqual([-7, 0]);
  });
  it("trunca a entero y devuelve un array nuevo", () => {
    const before = [1, 1];
    const after = applyDelta(before, 0, 2.7);
    expect(after).toEqual([3, 1]);
    expect(after).not.toBe(before);
  });
  it("asiento fuera de rango no cambia nada", () => {
    expect(applyDelta([1, 2], 5, 1)).toEqual([1, 2]);
  });
});
