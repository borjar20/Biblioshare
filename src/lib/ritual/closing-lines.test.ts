import { describe, expect, it } from "vitest";
import { recapLine } from "./closing-lines";

const fmt = { weekday: () => "viernes" };
const recap = { sessions: 23, days: 41, longestStreak: 9, pages: 412, episodes: null };

describe("recapLine", () => {
  it("libro con páginas", () => {
    expect(recapLine("book", recap, new Date(), fmt)).toEqual({ key: "recapBook", values: { sessions: 23, days: 41, pages: 412, streak: 9 } });
  });
  it("libro sin páginas conocidas", () => {
    expect(recapLine("book", { ...recap, pages: null }, new Date(), fmt).key).toBe("recapSessions");
  });
  it("serie con episodios", () => {
    expect(recapLine("series", { ...recap, pages: null, episodes: 8 }, new Date(), fmt)).toEqual({ key: "recapSeries", values: { episodes: 8, days: 41 } });
  });
  it("serie sin episodios con fecha: genérica, nunca «0 episodios»", () => {
    const empty = { sessions: 0, days: 0, longestStreak: 0, pages: null, episodes: 0 };
    expect(recapLine("series", empty, new Date(), fmt)).toEqual({ key: "generic", values: { type: "series" } });
    expect(recapLine("series", null, new Date(), fmt).key).toBe("generic");
  });
  it("película: día y franja de ahora", () => {
    const fri22 = new Date(2026, 10, 6, 22, 0);
    expect(recapLine("movie", null, fri22, fmt)).toEqual({ key: "movieNight", values: { weekday: "viernes", daypart: "night" } });
    expect(recapLine("movie", null, new Date(2026, 10, 6, 10), fmt).values.daypart).toBe("morning");
    expect(recapLine("movie", null, new Date(2026, 10, 6, 17), fmt).values.daypart).toBe("afternoon");
  });
  it("sin recuento ni sesiones: genérica por tipo", () => {
    expect(recapLine("book", null, new Date(), fmt)).toEqual({ key: "generic", values: { type: "book" } });
    expect(recapLine("book", { ...recap, sessions: 0 }, new Date(), fmt).key).toBe("generic");
  });
});
