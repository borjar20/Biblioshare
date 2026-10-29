import { describe, expect, it } from "vitest";
import { sagaInitials } from "./index-saga";

describe("sagaInitials", () => {
  it.each([
    ["[QA Sagas v2] Universo", "QS"],
    ["La Rueda del Tiempo", "LR"],
    ["¡Mamma Mia! - Colección", "MM"],
    ["X - Colección", "XC"],
    ["###", "#"],
    ["2001 Odisea", "O"],
    ["1984", "1"],
  ])("%s → %s", (name, expected) => {
    expect(sagaInitials(name)).toBe(expected);
  });
});
