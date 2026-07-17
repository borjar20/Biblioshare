import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  durationBucket,
  eligibleItems,
  sampleShelf,
  SHELF_MAX,
  spineHeight,
  type SorteoItem,
} from "./sorteo-logic";

function item(overrides: Partial<SorteoItem>): SorteoItem {
  return {
    itemType: "book",
    itemId: "id-1",
    title: "Piranesi",
    subtitle: "Susanna Clarke",
    coverUrl: null,
    metaText: "272 pág.",
    estimatedMinutes: 236,
    estimateText: "272 páginas ÷ 1.15 páginas/min ≈ 3h 56min",
    fresh: true,
    ...overrides,
  };
}

describe("durationBucket", () => {
  it("‹2h es short, el límite 120 ya es med", () => {
    expect(durationBucket(119)).toBe("short");
    expect(durationBucket(120)).toBe("med");
  });

  it("2–5h es med, más de 300 es long", () => {
    expect(durationBucket(300)).toBe("med");
    expect(durationBucket(301)).toBe("long");
  });

  it("sin estimación no hay bucket", () => {
    expect(durationBucket(null)).toBeNull();
  });
});

describe("eligibleItems", () => {
  const pool: SorteoItem[] = [
    item({ itemId: "b1", itemType: "book", estimatedMinutes: 90 }),
    item({ itemId: "m1", itemType: "movie", estimatedMinutes: 105, fresh: false }),
    item({ itemId: "s1", itemType: "series", estimatedMinutes: 480 }),
    item({ itemId: "b2", itemType: "book", estimatedMinutes: null }),
  ];

  it("sin filtros pasa todo el pool", () => {
    expect(eligibleItems(pool, DEFAULT_FILTERS)).toHaveLength(4);
  });

  it("filtra por tipo", () => {
    const out = eligibleItems(pool, { ...DEFAULT_FILTERS, type: "book" });
    expect(out.map((i) => i.itemId)).toEqual(["b1", "b2"]);
  });

  it("filtra por duración y excluye los ítems sin estimación", () => {
    const out = eligibleItems(pool, { ...DEFAULT_FILTERS, dur: "short" });
    expect(out.map((i) => i.itemId)).toEqual(["b1", "m1"]);
  });

  it("'sin empezar' deja solo los fresh", () => {
    const out = eligibleItems(pool, { ...DEFAULT_FILTERS, state: "fresh" });
    expect(out.map((i) => i.itemId)).toEqual(["b1", "s1", "b2"]);
  });

  it("los filtros se combinan (AND)", () => {
    const out = eligibleItems(pool, { type: "movie", dur: "short", state: "fresh" });
    expect(out).toHaveLength(0);
  });
});

describe("sampleShelf", () => {
  const many = Array.from({ length: 30 }, (_, i) => item({ itemId: `id-${i}` }));

  it("recorta a SHELF_MAX sin repetir", () => {
    const out = sampleShelf(many, () => 0.5);
    expect(out).toHaveLength(SHELF_MAX);
    expect(new Set(out.map((i) => i.itemId)).size).toBe(SHELF_MAX);
  });

  it("con pocos ítems los devuelve todos", () => {
    expect(sampleShelf(many.slice(0, 3), () => 0.5)).toHaveLength(3);
  });

  it("no muta el array de entrada", () => {
    const input = many.slice(0, 5);
    const before = input.map((i) => i.itemId);
    sampleShelf(input, () => 0.1);
    expect(input.map((i) => i.itemId)).toEqual(before);
  });
});

describe("spineHeight", () => {
  it("es determinista y queda en 55–100", () => {
    const a = spineHeight("abc-123");
    expect(a).toBe(spineHeight("abc-123"));
    for (const id of ["a", "zz-9", "0f8e", "otro-id-largo-uuid"]) {
      const h = spineHeight(id);
      expect(h).toBeGreaterThanOrEqual(55);
      expect(h).toBeLessThanOrEqual(100);
    }
  });
});
