import { describe, it, expect } from "vitest";
import { parseStartedAt } from "./parse-started-at";

describe("parseStartedAt", () => {
  it("acepta un instante ISO y lo devuelve canónico", () => {
    expect(parseStartedAt("2026-08-02T21:15:00.000Z")).toBe(
      "2026-08-02T21:15:00.000Z",
    );
  });

  it("normaliza un ISO con offset a UTC", () => {
    expect(parseStartedAt("2026-08-02T23:15:00+02:00")).toBe(
      "2026-08-02T21:15:00.000Z",
    );
  });

  it("rechaza basura, vacío y undefined", () => {
    expect(parseStartedAt("abc")).toBeNull();
    expect(parseStartedAt("")).toBeNull();
    expect(parseStartedAt(undefined)).toBeNull();
  });
});
