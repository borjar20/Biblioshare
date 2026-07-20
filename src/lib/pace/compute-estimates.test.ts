import { describe, expect, it } from "vitest";
import { computePaceEstimates } from "./compute-estimates";
import type { EstimableItem } from "./types";
import type { BookPace } from "./get-reading-pace";
import type { MoviePace } from "./get-movie-cadence";

function makeItem(overrides: Partial<EstimableItem>): EstimableItem {
  return {
    entryId: "e",
    itemId: "i",
    itemType: "series",
    title: "T",
    coverUrl: null,
    subtitle: null,
    totalPages: null,
    durationMinutes: null,
    totalEpisodes: null,
    episodeRuntimeMinutes: null,
    tmdbId: null,
    ...overrides,
  };
}

const NO_MOVIE_PACE: MoviePace = null;

describe("computePaceEstimates", () => {
  it("estimates a series deterministically from episodes × episode runtime (no pace needed)", () => {
    const item = makeItem({
      entryId: "s1",
      itemType: "series",
      totalEpisodes: 40,
      episodeRuntimeMinutes: 22,
    });

    const result = computePaceEstimates([item], null, NO_MOVIE_PACE);

    expect(result.perItem.s1.minutes).toBe(880);
    expect(result.totalMinutes).toBe(880);
    expect(result.unresolvedCount).toBe(0);
    expect(result.perItem.s1.formulaText).toContain("40 episodios × 22 min/episodio");
  });

  it("counts a series with unknown episode runtime as unresolved, not zero", () => {
    const item = makeItem({
      entryId: "s2",
      itemType: "series",
      totalEpisodes: 10,
      episodeRuntimeMinutes: null,
    });

    const result = computePaceEstimates([item], null, NO_MOVIE_PACE);

    expect(result.perItem.s2.minutes).toBeNull();
    expect(result.totalMinutes).toBe(0);
    expect(result.unresolvedCount).toBe(1);
    expect(result.perItem.s2.formulaText).toBe("Duración de episodio desconocida");
  });

  it("excludes unresolved items from the total but still totals the resolved ones", () => {
    const bookPace: BookPace = { pagesPerMinute: 2, sampleCount: 5 };
    const items = [
      makeItem({ entryId: "b1", itemType: "book", totalPages: 200 }), // 100 min
      makeItem({ entryId: "m1", itemType: "movie", durationMinutes: 120 }), // 120 min
      makeItem({ entryId: "s1", itemType: "series", totalEpisodes: 5 }), // unresolved
    ];

    const result = computePaceEstimates(items, bookPace, NO_MOVIE_PACE);

    expect(result.totalMinutes).toBe(220);
    expect(result.unresolvedCount).toBe(1);
  });
});
