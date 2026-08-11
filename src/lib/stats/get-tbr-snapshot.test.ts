import { describe, it, expect } from "vitest";
import { computeTbrSnapshot } from "./get-tbr-snapshot";

const NOW = new Date("2026-08-03T00:00:00Z");

describe("computeTbrSnapshot", () => {
  it("cuenta por tipo y señala la obra más antigua", () => {
    const r = computeTbrSnapshot(
      [
        { item_type: "movie", item_id: "m1", created_at: "2026-06-01T00:00:00Z" },
        { item_type: "movie", item_id: "m2", created_at: "2026-05-01T00:00:00Z" },
        { item_type: "book", item_id: "b1", created_at: "2026-02-01T00:00:00Z" },
      ],
      NOW,
    );
    expect(r.pending).toBe(3);
    expect(r.byType).toEqual({ book: 1, movie: 2, series: 0 });
    expect(r.oldestId).toEqual({ type: "book", id: "b1", monthsWaiting: 6 });
  });

  it("pila vacía → sin obra más antigua", () => {
    const r = computeTbrSnapshot([], NOW);
    expect(r.pending).toBe(0);
    expect(r.oldestId).toBeNull();
  });
});
