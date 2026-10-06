import { describe, expect, it } from "vitest";
import { addDays, formatReleaseDate, isExactReleaseDate, madridDay, parseReleaseDate } from "./precision";

describe("announcement date precision", () => {
  it.each(["2026-02-30", "2026-13-01", "2026-00", "2026-13", "26-01-01", "2026-1", "2026-10-06T00:00:00Z", "1399", "2201"])("rejects invalid %s without date rollover", (value) => {
    expect(() => parseReleaseDate(value)).toThrow("invalid");
  });
  it.each([
    ["2028-02-29", { date_precision: "day", date_value: "2028-02-29" }],
    ["2026-12", { date_precision: "month", date_value: "2026-12" }],
    ["2027", { date_precision: "year", date_value: "2027" }],
    ["", { date_precision: "unknown", date_value: null }],
  ])("preserves %s without adding a day", (value, expected) => {
    expect(parseReleaseDate(value)).toEqual(expected);
  });
  it("formats the available precision without fake dates", () => {
    expect(formatReleaseDate(parseReleaseDate("2026-12"))).toBe("diciembre de 2026");
    expect(formatReleaseDate(parseReleaseDate("2027"))).toBe("2027");
    expect(formatReleaseDate(parseReleaseDate(null))).toBe("Fecha por confirmar");
    expect(isExactReleaseDate("2026-02-29")).toBe(false);
  });
  it("uses Madrid calendar days across UTC midnight and daylight saving", () => {
    expect(madridDay(new Date("2026-10-05T22:30:00Z"))).toBe("2026-10-06");
    expect(madridDay(new Date("2026-12-05T23:30:00Z"))).toBe("2026-12-06");
    expect(addDays("2026-10-25", -1)).toBe("2026-10-24");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
