import { describe, expect, it } from "vitest";
import { computeTime } from "./compute-time";

describe("computeTime", () => {
  it("libros por sesiones", () => {
    const t = computeTime({ sessions: [
      { item_type: "book", pass_id: "p1", duration_minutes: 30 },
      { item_type: "book", pass_id: "p1", duration_minutes: null },
    ], finishedMovies: [], episodes: [], previousMinutes: null });
    expect(t.minutes).toEqual({ book: 30, movie: 0, series: 0 });
  });
  it("película sin sesiones suma su duración; con sesiones, solo las sesiones", () => {
    const t = computeTime({
      sessions: [{ item_type: "movie", pass_id: "m2", duration_minutes: 50 }],
      finishedMovies: [{ pass_id: "m1", duration_minutes: 120 }, { pass_id: "m2", duration_minutes: 130 }],
      episodes: [], previousMinutes: 10,
    });
    expect(t.minutes.movie).toBe(170);
    expect(t.previousMinutes).toBe(10);
  });
  it("película sin duración conocida no inventa nada", () => {
    const t = computeTime({ sessions: [], finishedMovies: [{ pass_id: "m1", duration_minutes: null }], episodes: [], previousMinutes: null });
    expect(t.minutes.movie).toBe(0);
  });
  it("series: episodios × runtime; sin runtime se cuentan aparte", () => {
    const t = computeTime({ sessions: [], finishedMovies: [], previousMinutes: null, episodes: [
      { series_id: "s1", episode_runtime_minutes: 45 },
      { series_id: "s1", episode_runtime_minutes: 45 },
      { series_id: "s2", episode_runtime_minutes: null },
    ] });
    expect(t.minutes.series).toBe(90);
    expect(t.episodesWithoutRuntime).toBe(1);
  });
});
