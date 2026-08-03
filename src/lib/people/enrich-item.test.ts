import { describe, expect, it } from "vitest";
import { needsSizeHydration } from "./enrich-item";

describe("needsSizeHydration", () => {
  it("pide duración cuando la película no la tiene", () => {
    expect(needsSizeHydration("movie", { id: "m1", durationMinutes: null })).toBe(true);
  });

  it("no repite trabajo si la película ya tiene duración", () => {
    expect(needsSizeHydration("movie", { id: "m1", durationMinutes: 148 })).toBe(false);
  });

  // El caso de #365: 12 de las 20 películas pendientes YA tenían créditos y
  // seguían sin duración. Si el guard de tamaños dependiera de `creditsExist`
  // no se rellenarían nunca — por eso es independiente y por eso este test.
  it("no lo decide la ausencia de campo: undefined cuenta como que falta", () => {
    expect(needsSizeHydration("movie", { id: "m1" })).toBe(true);
  });

  it("una serie necesita AMBOS: episodios y duración de episodio", () => {
    const base = { id: "s1", totalEpisodes: 62, episodeRuntimeMinutes: 47 };
    expect(needsSizeHydration("series", base)).toBe(false);
    expect(needsSizeHydration("series", { ...base, totalEpisodes: null })).toBe(true);
    expect(needsSizeHydration("series", { ...base, episodeRuntimeMinutes: null })).toBe(true);
  });

  it("los libros no tienen tamaño que hidratar (sus páginas son de la edición)", () => {
    expect(needsSizeHydration("book", { id: "b1" })).toBe(false);
  });
});
