import { describe, expect, it } from "vitest";
import { mapTmdbJob } from "./map-tmdb-job";

describe("mapTmdbJob", () => {
  it("Director -> director", () => {
    expect(mapTmdbJob("Director")).toBe("director");
  });

  it("los tres jobs de guion -> writer", () => {
    expect(mapTmdbJob("Writer")).toBe("writer");
    expect(mapTmdbJob("Screenplay")).toBe("writer");
    expect(mapTmdbJob("Story")).toBe("writer");
  });

  it("Creator -> creator", () => {
    expect(mapTmdbJob("Creator")).toBe("creator");
  });

  it("es indiferente a mayúsculas y espacios", () => {
    expect(mapTmdbJob("  director ")).toBe("director");
    expect(mapTmdbJob("SCREENPLAY")).toBe("writer");
  });

  it("un job sin rol equivalente -> null (se descarta el crédito)", () => {
    expect(mapTmdbJob("Producer")).toBeNull();
    expect(mapTmdbJob("Director of Photography")).toBeNull();
    expect(mapTmdbJob("Original Music Composer")).toBeNull();
  });

  it("null/undefined/vacío -> null", () => {
    expect(mapTmdbJob(null)).toBeNull();
    expect(mapTmdbJob(undefined)).toBeNull();
    expect(mapTmdbJob("")).toBeNull();
  });
});
