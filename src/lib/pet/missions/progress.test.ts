import { describe, expect, it } from "vitest";
import { dayCounts, missionProgress, type DayRows, type PetDayCounts } from "./progress";

const day = (ts: string) => ts.slice(0, 10);

const ROWS: DayRows = {
  sessions: [
    { pass_id: "A", duration_minutes: 15, position: 100, session_date: "2026-09-02", started_at: "2026-09-02T20:00:00Z" },
    { pass_id: "A", duration_minutes: 10, position: 130, session_date: "2026-09-03", started_at: "2026-09-03T08:00:00Z" },
    { pass_id: "A", duration_minutes: 12, position: 120, session_date: "2026-09-03", started_at: "2026-09-03T09:00:00Z" },
    { pass_id: "B", duration_minutes: 5, position: null, session_date: "2026-09-03", started_at: null },
  ],
  episodes: [
    { watched_on: "2026-09-03", rating: 4 },
    { watched_on: "2026-09-02", rating: null },
  ],
  passes: [
    { item_type: "book", item_id: "b1", status: "completed", finished_on: "2026-09-03", rating: 5, created_at: "2026-08-01T10:00:00.5Z", updated_at: "2026-09-03T10:00:00.5Z", lived: true },
    { item_type: "book", item_id: "b2", status: "in_progress", finished_on: null, rating: null, created_at: "2026-09-03T11:00:00.5Z", updated_at: "2026-09-03T11:00:00.5Z", lived: true },
    { item_type: "book", item_id: "b3", status: "completed", finished_on: "2020-01-01", rating: 3, created_at: "2026-09-03T11:00:00.5Z", updated_at: "2026-09-03T11:00:00.5Z", lived: false },
  ],
  notes: [
    { kind: "note", created_at: "2026-09-03T12:00:00.5Z" },
    { kind: "quote", created_at: "2026-09-03T12:30:00.5Z" },
    { kind: "note", created_at: "2026-09-02T12:00:00.5Z" },
  ],
  posts: [{ kind: "text", created_at: "2026-09-03T13:00:00.5Z" }, { kind: "poll", created_at: "2026-09-03T13:00:00.5Z" }],
  votes: [{ voted_at: "2026-09-03T14:00:00.5Z" }],
  reviewedKeys: ["book:b1"],
};

describe("dayCounts", () => {
  it("solo cuenta las filas del día pedido; las páginas se miden contra la sesión anterior aunque sea de otro día", () => {
    const d = dayCounts(ROWS, "2026-09-03", day);
    expect(d.minutes).toBe(10 + 12 + 5);
    // A: 100 (ayer) → 130 hoy = 30; 130 → 120 = retroceso = 0. B sin posición.
    expect(d.pages).toBe(30);
    expect(d.episodes).toBe(1);
    expect(d.finishedKeys).toEqual(["book:b1"]);
    expect(d.notes).toBe(1);
    expect(d.quotes).toBe(1);
    // b1 valorado hoy (updated_at hoy) + episodio con nota hoy; b3 es historial y no cuenta
    expect(d.ratings).toBe(2);
    expect(d.posts).toBe(1);
    expect(d.votes).toBe(1);
    // b2 creado hoy y vivido; b3 creado hoy pero historial
    expect(d.newWorks).toBe(1);
    expect(d.reviewedKeys).toEqual(["book:b1"]);
  });

  it("otro día: vacío salvo lo suyo", () => {
    const d = dayCounts(ROWS, "2026-09-02", day);
    expect(d.minutes).toBe(15);
    expect(d.pages).toBe(100);
    expect(d.notes).toBe(1);
    expect(d.finishedKeys).toEqual([]);
  });
});

describe("missionProgress", () => {
  const d: PetDayCounts = {
    minutes: 25, pages: 30, episodes: 1, finishedKeys: ["book:b1"], notes: 1, quotes: 0, ratings: 2,
    reviewedKeys: ["book:b1"], posts: 0, votes: 1, newWorks: 1,
  };
  it("cada plantilla lee su contador", () => {
    expect(missionProgress({ template: "session_minutes", target: 20, item_type: null, item_id: null }, d)).toBe(25);
    expect(missionProgress({ template: "session_pages", target: 30, item_type: null, item_id: null }, d)).toBe(30);
    expect(missionProgress({ template: "daily_goal", target: 30, item_type: null, item_id: null }, d)).toBe(25);
    expect(missionProgress({ template: "episodes", target: 2, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "note", target: 1, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "quote", target: 1, item_type: null, item_id: null }, d)).toBe(0);
    expect(missionProgress({ template: "rating", target: 1, item_type: null, item_id: null }, d)).toBe(2);
    expect(missionProgress({ template: "post", target: 1, item_type: null, item_id: null }, d)).toBe(0);
    expect(missionProgress({ template: "vote", target: 1, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "new_work", target: 1, item_type: null, item_id: null }, d)).toBe(1);
    expect(missionProgress({ template: "any_activity", target: 1, item_type: null, item_id: null }, d)).toBe(1);
  });
  it("las duras solo cuentan la obra asignada", () => {
    expect(missionProgress({ template: "finish_pass", target: 1, item_type: "book", item_id: "b1" }, d)).toBe(1);
    expect(missionProgress({ template: "finish_pass", target: 1, item_type: "book", item_id: "b9" }, d)).toBe(0);
    expect(missionProgress({ template: "review", target: 1, item_type: "book", item_id: "b1" }, d)).toBe(1);
    expect(missionProgress({ template: "review", target: 1, item_type: "book", item_id: "b9" }, d)).toBe(0);
  });
  it("any_activity es 0 sin nada", () => {
    const empty: PetDayCounts = { minutes: 0, pages: 0, episodes: 0, finishedKeys: [], notes: 0, quotes: 0, ratings: 0, reviewedKeys: [], posts: 0, votes: 0, newWorks: 0 };
    expect(missionProgress({ template: "any_activity", target: 1, item_type: null, item_id: null }, empty)).toBe(0);
  });
});
