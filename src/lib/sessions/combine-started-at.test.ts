import { describe, it, expect } from "vitest";
import { combineStartedAt } from "./combine-started-at";

describe("combineStartedAt", () => {
  it("devuelve null si no hay hora (el caso por defecto)", () => {
    expect(combineStartedAt("2026-07-27", "")).toBeNull();
  });

  it("combina fecha y hora en un ISO cuyos componentes LOCALES coinciden con lo introducido", () => {
    const result = combineStartedAt("2026-07-27", "20:15");
    expect(result).not.toBeNull();
    const asDate = new Date(result as string);
    expect(asDate.getFullYear()).toBe(2026);
    expect(asDate.getMonth()).toBe(6); // julio, 0-indexado
    expect(asDate.getDate()).toBe(27);
    expect(asDate.getHours()).toBe(20);
    expect(asDate.getMinutes()).toBe(15);
  });

  it("devuelve null si la fecha está vacía", () => {
    expect(combineStartedAt("", "20:15")).toBeNull();
  });
});
