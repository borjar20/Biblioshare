import { describe, expect, it } from "vitest";
import { parseWatchedOn } from "./watched-on";

const NOW = new Date("2026-09-23T23:30:00Z");

describe("parseWatchedOn", () => {
  it("acepta la fecha local de hoy y la de mañana UTC (husos por delante)", () => {
    expect(parseWatchedOn("2026-09-23", NOW)).toBe("2026-09-23");
    expect(parseWatchedOn("2026-09-24", NOW)).toBe("2026-09-24");
  });

  it("acepta fechas pasadas (registrar un visionado de otro día)", () => {
    expect(parseWatchedOn("2024-01-15", NOW)).toBe("2024-01-15");
  });

  it("rechaza el futuro más allá de un día", () => {
    expect(parseWatchedOn("2026-09-26", NOW)).toBeNull();
  });

  it("rechaza formatos y fechas imposibles", () => {
    expect(parseWatchedOn("23/09/2026", NOW)).toBeNull();
    expect(parseWatchedOn("2026-02-30", NOW)).toBeNull();
    expect(parseWatchedOn("1970-01-01", NOW)).toBeNull();
    expect(parseWatchedOn(undefined, NOW)).toBeNull();
    expect(parseWatchedOn(20260923, NOW)).toBeNull();
  });
});
