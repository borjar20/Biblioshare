import { describe, expect, it } from "vitest";
import { episodesUpTo, hasNewEpisodesAfter, isUpToDate, seasonToMark } from "./follow-state";

describe("isUpToDate", () => {
  const base = {
    status: "in_progress" as const,
    watched: 10,
    aired: 10,
    tmdbStatus: "Returning Series",
  };

  it("viendo, todo lo emitido visto y en emisión: al día", () => {
    expect(isUpToDate(base)).toBe(true);
  });

  it("queda algo emitido sin ver: viendo, no al día", () => {
    expect(isUpToDate({ ...base, watched: 9 })).toBe(false);
  });

  it("serie terminada: no hay «al día», está vista", () => {
    expect(isUpToDate({ ...base, tmdbStatus: "Ended" })).toBe(false);
    expect(isUpToDate({ ...base, tmdbStatus: "Canceled" })).toBe(false);
  });

  it("sin estado de TMDB no se afirma nada", () => {
    expect(isUpToDate({ ...base, tmdbStatus: null })).toBe(false);
  });

  it("solo aplica a un pase en curso", () => {
    expect(isUpToDate({ ...base, status: "completed" })).toBe(false);
    expect(isUpToDate({ ...base, status: "planned" })).toBe(false);
    expect(isUpToDate({ ...base, status: null })).toBe(false);
  });

  it("sin nada emitido no está al día de nada", () => {
    expect(isUpToDate({ ...base, watched: 0, aired: 0 })).toBe(false);
  });
});

describe("hasNewEpisodesAfter", () => {
  const ep = (season: number, episode: number, watched: boolean, aired = true) => ({
    season,
    episode,
    watched,
    aired,
  });

  it("temporada nueva emitida tras lo último visto", () => {
    expect(hasNewEpisodesAfter([ep(1, 1, true), ep(1, 2, true), ep(2, 1, false)])).toBe(true);
  });

  it("lo que queda detrás solo son anunciados: no hay nada que seguir", () => {
    expect(hasNewEpisodesAfter([ep(1, 1, true), ep(2, 1, false, false)])).toBe(false);
  });

  it("un hueco ANTES de lo último visto no es «nuevo»", () => {
    expect(hasNewEpisodesAfter([ep(1, 1, false), ep(1, 2, true)])).toBe(false);
  });

  it("sin nada visto en el pase (vista de un toque) no ofrece seguir", () => {
    expect(hasNewEpisodesAfter([ep(1, 1, false), ep(1, 2, false)])).toBe(false);
  });
});

describe("episodesUpTo / seasonToMark", () => {
  const ep = (season: number, episode: number, watched = false, aired = true) => ({
    season,
    episode,
    watched,
    aired,
  });
  const all = [ep(1, 1, true), ep(1, 2), ep(2, 1), ep(2, 2), ep(3, 1, false, false)];

  it("hasta aquí: lo emitido y sin ver hasta el elegido, incluido", () => {
    expect(episodesUpTo(all, { season: 2, episode: 1 })).toEqual([ep(1, 2), ep(2, 1)]);
  });

  it("hasta aquí no incluye anunciados aunque sea el elegido", () => {
    expect(episodesUpTo(all, { season: 3, episode: 1 })).toEqual([ep(1, 2), ep(2, 1), ep(2, 2)]);
  });

  it("episodio que no existe: nada", () => {
    expect(episodesUpTo(all, { season: 9, episode: 9 })).toEqual([]);
  });

  it("temporada: solo lo emitido y sin ver de esa temporada", () => {
    expect(seasonToMark(all, 1)).toEqual([ep(1, 2)]);
    expect(seasonToMark(all, 3)).toEqual([]);
  });
});
