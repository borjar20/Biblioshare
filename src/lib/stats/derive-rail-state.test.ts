import { describe, it, expect } from "vitest";
import { deriveRailState } from "./derive-rail-state";

const base = { weekMinutes: 0, annualTotal: 0, anyGoalSet: false, streakCurrent: 0 };

describe("deriveRailState", () => {
  it("frío: sin nada, cold=true y ambos bloques ocultos", () => {
    expect(deriveRailState(base)).toEqual({ showWeek: false, showYear: false, cold: true });
  });
  it("solo minutos de semana: showWeek, no cold", () => {
    expect(deriveRailState({ ...base, weekMinutes: 30 })).toEqual({
      showWeek: true,
      showYear: false,
      cold: false,
    });
  });
  it("solo completados del año: showYear, no cold", () => {
    expect(deriveRailState({ ...base, annualTotal: 1 })).toEqual({
      showWeek: false,
      showYear: true,
      cold: false,
    });
  });
  it("solo meta fijada: showYear, no cold", () => {
    expect(deriveRailState({ ...base, anyGoalSet: true })).toEqual({
      showWeek: false,
      showYear: true,
      cold: false,
    });
  });
  it("solo racha viva: showYear, no cold", () => {
    expect(deriveRailState({ ...base, streakCurrent: 3 })).toEqual({
      showWeek: false,
      showYear: true,
      cold: false,
    });
  });
  it("todo: ambos bloques, no cold", () => {
    expect(
      deriveRailState({ weekMinutes: 45, annualTotal: 5, anyGoalSet: true, streakCurrent: 2 }),
    ).toEqual({ showWeek: true, showYear: true, cold: false });
  });
});
