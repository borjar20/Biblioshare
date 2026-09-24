import { describe, expect, it } from "vitest";
import { needsBackdrop, needsSizeHydration } from "./enrich-item";

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

describe("needsBackdrop", () => {
  it("pide backdrop cuando la película o la serie no lo tiene", () => {
    expect(needsBackdrop("movie", { id: "m1", backdropUrl: null })).toBe(true);
    expect(needsBackdrop("series", { id: "s1", backdropUrl: null })).toBe(true);
  });

  it("no repite trabajo si ya lo tiene", () => {
    expect(
      needsBackdrop("movie", { id: "m1", backdropUrl: "https://image.tmdb.org/t/p/w1280/x.jpg" }),
    ).toBe(false);
  });

  // Mismo motivo que needsSizeHydration: es independiente de créditos y
  // tamaños. Una obra que ya tiene reparto y duración (casi todas las viejas)
  // no lo pediría nunca si dependiera de ellos.
  it("undefined cuenta como que falta", () => {
    expect(needsBackdrop("movie", { id: "m1", durationMinutes: 120 })).toBe(true);
  });

  it("los libros no tienen backdrop de TMDB", () => {
    expect(needsBackdrop("book", { id: "b1" })).toBe(false);
  });
});
