import { describe, it, expect } from "vitest";
import { RELEASE_TYPES, PLATFORMS, isValidReleaseType, platformAllowed } from "./event-release-types";

describe("event-release-types", () => {
  it("da vocabulario por medio y lo valida", () => {
    expect(RELEASE_TYPES.book.map((r) => r.value)).toContain("audiolibro");
    expect(RELEASE_TYPES.series.map((r) => r.value)).toContain("estreno_temporada");
    expect(isValidReleaseType("book", "audiolibro")).toBe(true);
    expect(isValidReleaseType("book", "estreno_temporada")).toBe(false); // no es de libro
    expect(isValidReleaseType("movie", "no_existe")).toBe(false);
  });

  it("la plataforma solo aplica a pantalla (movie/series)", () => {
    expect(platformAllowed("movie")).toBe(true);
    expect(platformAllowed("series")).toBe(true);
    expect(platformAllowed("book")).toBe(false);
    expect(PLATFORMS.map((p) => p.value)).toContain("netflix");
    expect(PLATFORMS.map((p) => p.value)).toContain("otro");
  });
});
