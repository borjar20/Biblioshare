import { describe, expect, it } from "vitest";
import { LINE_VARIANTS, lineFor, monthsBetween } from "./sorteo-lines";
import type { SorteoItem } from "./sorteo-logic";

const TODAY = new Date("2026-11-06T12:00:00Z");
const fmt = { duration: (m: number) => `${m}m`, since: (iso: string) => iso.slice(0, 7) };
const zero = () => 0;
const base: SorteoItem = {
  itemType: "book", itemId: "x", title: "T", subtitle: null, coverUrl: null, metaText: "",
  estimatedMinutes: 400, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-09-01T00:00:00Z", totalEpisodes: null,
};

describe("monthsBetween", () => {
  it("cuenta meses de calendario", () => {
    expect(monthsBetween("2025-11-06T00:00:00Z", TODAY)).toBe(12);
    expect(monthsBetween("2026-10-30T00:00:00Z", TODAY)).toBe(1);
  });
});

describe("lineFor: prioridad de hechos", () => {
  it("espera larga gana a todo", () => {
    const l = lineFor({ ...base, plannedSince: "2024-03-01T00:00:00Z", estimatedMinutes: 90 }, TODAY, fmt, zero);
    expect(l.key).toBe("waitLong");
    expect(l.values.since).toBe("2024-03");
    expect(l.values.years).toBe(2);
  });
  it("libro o película corta: tonight", () => {
    expect(lineFor({ ...base, estimatedMinutes: 150 }, TODAY, fmt, zero).key).toBe("tonight");
    expect(lineFor({ ...base, itemType: "movie", estimatedMinutes: 101 }, TODAY, fmt, zero).values.duration).toBe("101m");
  });
  it("serie de ≤10 episodios: miniseries (nunca tonight)", () => {
    const l = lineFor({ ...base, itemType: "series", estimatedMinutes: 100, totalEpisodes: 6 }, TODAY, fmt, zero);
    expect(l.key).toBe("miniseries");
    expect(l.values.episodes).toBe(6);
  });
  it("más de 600 min: long", () => {
    expect(lineFor({ ...base, estimatedMinutes: 601 }, TODAY, fmt, zero).key).toBe("long");
  });
  it("sin hechos de tiempo: retry si no es fresh, fresh si lo es", () => {
    expect(lineFor({ ...base, fresh: false }, TODAY, fmt, zero).key).toBe("retry");
    expect(lineFor(base, TODAY, fmt, zero).key).toBe("fresh");
  });
  it("la variante sale del rng y no se pasa del número de variantes", () => {
    const l = lineFor({ ...base, plannedSince: "2020-01-01T00:00:00Z" }, TODAY, fmt, () => 0.999);
    expect(l.variant).toBe(LINE_VARIANTS.waitLong - 1);
  });
});
