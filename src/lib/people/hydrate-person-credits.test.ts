import { describe, expect, it } from "vitest";
import { needsCreditHydration } from "./hydrate-person-credits";

describe("needsCreditHydration", () => {
  it("con tmdbId y sin marca -> sí", () => {
    expect(
      needsCreditHydration({ id: "p", tmdbId: 500, openlibraryKey: null, creditsHydratedAt: null })
    ).toBe(true);
  });

  it("con openlibraryKey y sin marca -> sí", () => {
    expect(
      needsCreditHydration({ id: "p", tmdbId: null, openlibraryKey: "OL1A", creditsHydratedAt: null })
    ).toBe(true);
  });

  it("ya marcada -> no, aunque tenga id externo", () => {
    expect(
      needsCreditHydration({
        id: "p",
        tmdbId: 500,
        openlibraryKey: null,
        creditsHydratedAt: "2026-08-12T00:00:00Z",
      })
    ).toBe(false);
  });

  it("sin ningún id externo -> no (no hay a quién preguntar)", () => {
    expect(
      needsCreditHydration({ id: "p", tmdbId: null, openlibraryKey: null, creditsHydratedAt: null })
    ).toBe(false);
  });
});
