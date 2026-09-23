import { describe, expect, it } from "vitest";
import { groupSeriesDays } from "./series-days";

describe("groupSeriesDays", () => {
  it("agrupa por serie y día, contando episodios y la franja de marcado", () => {
    const days = groupSeriesDays([
      { series_id: "a", watched_on: "2026-09-20", created_at: "2026-09-20T21:00:00Z" },
      { series_id: "a", watched_on: "2026-09-20", created_at: "2026-09-20T20:00:00Z" },
      { series_id: "b", watched_on: "2026-09-20", created_at: "2026-09-20T22:00:00Z" },
      { series_id: "a", watched_on: "2026-09-21", created_at: "2026-09-21T10:00:00Z" },
    ]);
    expect(days).toEqual([
      { seriesId: "a", day: "2026-09-20", episodes: 2, firstAt: "2026-09-20T20:00:00Z", lastAt: "2026-09-20T21:00:00Z" },
      { seriesId: "b", day: "2026-09-20", episodes: 1, firstAt: "2026-09-20T22:00:00Z", lastAt: "2026-09-20T22:00:00Z" },
      { seriesId: "a", day: "2026-09-21", episodes: 1, firstAt: "2026-09-21T10:00:00Z", lastAt: "2026-09-21T10:00:00Z" },
    ]);
  });

  it("sin filas, sin días", () => {
    expect(groupSeriesDays([])).toEqual([]);
  });
});
