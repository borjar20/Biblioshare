import { describe, expect, it } from "vitest";
import type { FeedEpisode } from "@/lib/social/feed";
import { averageRating, bestEpisodes, episodeCode, highlights, seasonsOf } from "./episode-stats";

const ep = (episode: number, rating: number | null, season = 1): FeedEpisode => ({ season, episode, title: `E${episode}`, rating });

describe("episodeCode", () => {
  it("largo y corto", () => {
    expect(episodeCode(ep(4, 8))).toBe("S1E4");
    expect(episodeCode(ep(4, 8), true)).toBe("E4");
  });
});

describe("bestEpisodes", () => {
  it("un único mejor", () => {
    const eps = [ep(1, 6), ep(2, 9), ep(3, 7)];
    expect([...bestEpisodes(eps)]).toEqual([eps[1]]);
  });
  it("empate parcial: todos los empatados", () => {
    const eps = [ep(1, 9), ep(2, 6), ep(3, 9)];
    expect([...bestEpisodes(eps)]).toEqual([eps[0], eps[2]]);
  });
  it("empate total: ninguno", () => {
    expect(bestEpisodes([ep(1, 8), ep(2, 8)]).size).toBe(0);
  });
  it("sin notas: ninguno; una sola nota: esa", () => {
    expect(bestEpisodes([ep(1, null), ep(2, null)]).size).toBe(0);
    const eps = [ep(1, null), ep(2, 7)];
    expect([...bestEpisodes(eps)]).toEqual([eps[1]]);
  });
});

describe("highlights", () => {
  it("3 mejores y 3 peores, ignorando sin nota, desempate por orden de emisión", () => {
    const eps = [ep(1, 6), ep(2, 10), ep(3, null), ep(4, 2), ep(5, 8), ep(6, 4), ep(7, 10), ep(8, 6)];
    const { best, worst } = highlights(eps);
    expect(best.map((e) => e.episode)).toEqual([2, 7, 5]);
    expect(worst.map((e) => e.episode)).toEqual([4, 6, 1]);
  });
  it("con pocas notas no se solapan", () => {
    const eps = [ep(1, 6), ep(2, 10), ep(3, 2)];
    const { best, worst } = highlights(eps);
    expect(best.map((e) => e.episode)).toEqual([2, 1]);
    expect(worst.map((e) => e.episode)).toEqual([3]);
  });
});

describe("averageRating y seasonsOf", () => {
  it("media de las notas; null con menos de 2", () => {
    expect(averageRating([ep(1, 8), ep(2, 7), ep(3, null)])).toBe(7.5);
    expect(averageRating([ep(1, 8), ep(2, null)])).toBeNull();
  });
  it("temporadas únicas y ordenadas", () => {
    expect(seasonsOf([ep(25, 7, 1), ep(26, 7, 1), ep(1, 7, 2)])).toEqual([1, 2]);
  });
});
