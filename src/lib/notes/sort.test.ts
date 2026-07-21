import { describe, expect, it } from "vitest";
import { compareNotes, type SortableNote } from "./sort";

const n = (position: SortableNote["position"], createdAt = "2026-01-01"): SortableNote => ({
  position,
  createdAt,
});

describe("compareNotes", () => {
  it("libro: ordena por página ascendente", () => {
    expect(compareNotes("book", n({ page: 12 }), n({ page: 240 }))).toBeLessThan(0);
  });

  it("serie: T1E12 va antes que T2E5 (no compara solo el episodio)", () => {
    const a = n({ season: 1, episode: 12 });
    const b = n({ season: 2, episode: 5 });
    expect(compareNotes("series", a, b)).toBeLessThan(0);
  });

  it("lo anclado va SIEMPRE antes que lo suelto, aunque lo suelto sea más nuevo", () => {
    const anchored = n({ page: 5 }, "2020-01-01");
    const loose = n({}, "2026-12-31");
    expect(compareNotes("book", anchored, loose)).toBeLessThan(0);
    expect(compareNotes("book", loose, anchored)).toBeGreaterThan(0);
  });

  it("entre sueltas, la más nueva primero", () => {
    const older = n({}, "2026-01-01");
    const newer = n({}, "2026-06-01");
    expect(compareNotes("book", newer, older)).toBeLessThan(0);
  });

  it("película: no hay anclaje, todo cae al grupo suelto por fecha", () => {
    const older = n({}, "2026-01-01");
    const newer = n({}, "2026-06-01");
    expect(compareNotes("movie", newer, older)).toBeLessThan(0);
  });

  it("empate de posición: desempata por fecha, la más nueva primero", () => {
    const a = n({ page: 10 }, "2026-06-01");
    const b = n({ page: 10 }, "2026-01-01");
    expect(compareNotes("book", a, b)).toBeLessThan(0);
  });

  it("es un comparador consistente: ordenar una lista mezclada", () => {
    const list = [
      n({}, "2026-03-01"),
      n({ page: 240 }),
      n({ page: 12 }),
      n({}, "2026-09-01"),
    ];
    const sorted = [...list].sort((x, y) => compareNotes("book", x, y));
    expect(sorted.map((s) => ("page" in s.position ? s.position.page : s.createdAt))).toEqual([
      12,
      240,
      "2026-09-01",
      "2026-03-01",
    ]);
  });
});
