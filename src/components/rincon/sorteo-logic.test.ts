import { describe, expect, it } from "vitest";
import {
  ALL_BUCKETS,
  antojosFor,
  DEFAULT_SETTINGS,
  durationBucket,
  eligibleItems,
  initials,
  isQuick,
  longestWaiting,
  normalizeSettings,
  sampleCandidates,
  sampleFromShelf,
  seriesLabel,
  spineHeight,
  spineWidth,
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
    estimateText: "≈ 3h 56min",
    fresh: true,
    collectionIds: [],
    plannedSince: "2026-01-10T10:00:00Z",
    totalEpisodes: null,
    ...overrides,
  };
}

describe("durationBucket", () => {
  it("‹2h es short, 120 ya es med, 300 med, 301 long, null none", () => {
    expect(durationBucket(119)).toBe("short");
    expect(durationBucket(120)).toBe("med");
    expect(durationBucket(300)).toBe("med");
    expect(durationBucket(301)).toBe("long");
    expect(durationBucket(null)).toBe("none");
  });
});

describe("isQuick", () => {
  it("libro: ≤ 240 min a tu ritmo", () => {
    expect(isQuick(item({ estimatedMinutes: 240 }))).toBe(true);
    expect(isQuick(item({ estimatedMinutes: 241 }))).toBe(false);
    expect(isQuick(item({ estimatedMinutes: null }))).toBe(false);
  });
  it("película: ≤ 150 min", () => {
    expect(isQuick(item({ itemType: "movie", estimatedMinutes: 150 }))).toBe(true);
    expect(isQuick(item({ itemType: "movie", estimatedMinutes: 151 }))).toBe(false);
  });
  it("serie: ≤ 10 episodios o ≤ 480 min", () => {
    expect(isQuick(item({ itemType: "series", totalEpisodes: 10, estimatedMinutes: 900 }))).toBe(true);
    expect(isQuick(item({ itemType: "series", totalEpisodes: 11, estimatedMinutes: 480 }))).toBe(true);
    expect(isQuick(item({ itemType: "series", totalEpisodes: 11, estimatedMinutes: 481 }))).toBe(false);
    expect(isQuick(item({ itemType: "series", totalEpisodes: null, estimatedMinutes: null }))).toBe(false);
  });
});

describe("antojosFor", () => {
  const cols = [{ id: "c1", name: "Clásicos" }];
  it("con Todo: sin antojo de duración y uno por colección", () => {
    expect(antojosFor("all", cols).map((a) => a.id)).toEqual(["any", "wait", "fresh", "col:c1"]);
  });
  it("con un tipo: el de duración en segunda posición y sin colecciones", () => {
    expect(antojosFor("movie", cols).map((a) => a.id)).toEqual(["any", "quick", "wait", "fresh"]);
  });
});

describe("longestWaiting", () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      item({ itemId: `i${i}`, plannedSince: `2020-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` })
    );
  it("devuelve el tercio más antiguo, con mínimo 3", () => {
    expect(longestWaiting(mk(10)).map((i) => i.itemId)).toEqual(["i0", "i1", "i2", "i3"]);
    expect(longestWaiting(mk(3))).toHaveLength(3);
    expect(longestWaiting(mk(1))).toHaveLength(1);
  });
  it("ordena aunque llegue desordenado", () => {
    expect(longestWaiting(mk(6).reverse()).map((i) => i.itemId)).toEqual(["i0", "i1", "i2"]);
  });
});

describe("eligibleItems", () => {
  const pool = [
    item({ itemId: "b1", estimatedMinutes: 90 }),
    item({ itemId: "m1", itemType: "movie", estimatedMinutes: 105, fresh: false }),
    item({ itemId: "s1", itemType: "series", estimatedMinutes: 480, totalEpisodes: 8, collectionIds: ["c1"] }),
    item({ itemId: "b2", estimatedMinutes: null }),
  ];
  const ids = (xs: SorteoItem[]) => xs.map((i) => i.itemId);

  it("por defecto pasa todo", () => {
    expect(eligibleItems(pool, DEFAULT_SETTINGS)).toHaveLength(4);
  });
  it("tipo + antojo de duración", () => {
    expect(ids(eligibleItems(pool, { ...DEFAULT_SETTINGS, type: "book", antojo: "quick" }))).toEqual(["b1"]);
  });
  it("nunca empezado", () => {
    expect(ids(eligibleItems(pool, { ...DEFAULT_SETTINGS, antojo: "fresh" }))).toEqual(["b1", "s1", "b2"]);
  });
  it("colección", () => {
    expect(ids(eligibleItems(pool, { ...DEFAULT_SETTINGS, antojo: "col:c1" }))).toEqual(["s1"]);
  });
  it("los tramos de tiempo filtran y se combinan con el antojo", () => {
    const s = { ...DEFAULT_SETTINGS, buckets: ["none" as const] };
    expect(ids(eligibleItems(pool, s))).toEqual(["b2"]);
    expect(eligibleItems(pool, { ...s, antojo: "fresh" })).toHaveLength(1);
  });
  it("el antojo explícito manda sobre el de los ajustes (para los recuentos)", () => {
    expect(eligibleItems(pool, DEFAULT_SETTINGS, "fresh")).toHaveLength(3);
  });
});

describe("normalizeSettings", () => {
  it("antojo que no existe para el tipo vuelve a any", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, antojo: "quick" }, []).antojo).toBe("any");
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, antojo: "col:gone" }, []).antojo).toBe("any");
  });
  it("tramos vacíos vuelven a todos", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, buckets: [] }, []).buckets).toEqual(ALL_BUCKETS);
  });
  it("basura de localStorage vuelve a los valores por defecto", () => {
    expect(normalizeSettings({ type: "x", antojo: 3, buckets: "y" } as never, [])).toEqual(DEFAULT_SETTINGS);
  });
});

describe("sampleCandidates", () => {
  const many = Array.from({ length: 9 }, (_, i) => item({ itemId: `i${i}` }));
  it("hasta 3 sin repetir", () => {
    const out = sampleCandidates(many, () => 0.42);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((i) => i.itemId)).size).toBe(3);
  });
  it("con menos de 3 devuelve los que hay", () => {
    expect(sampleCandidates(many.slice(0, 2))).toHaveLength(2);
  });
});

describe("medidas del lomo", () => {
  it("el grosor crece con el tiempo y tiene tope", () => {
    expect(spineWidth(item({ estimatedMinutes: null }))).toBe(26);
    expect(spineWidth(item({ estimatedMinutes: 60 }))).toBeLessThan(spineWidth(item({ estimatedMinutes: 600 })));
    expect(spineWidth(item({ estimatedMinutes: 99999 }))).toBe(spineWidth(item({ estimatedMinutes: 720 })));
  });
  it("las series nunca son más finas que 32", () => {
    expect(spineWidth(item({ itemType: "series", estimatedMinutes: 30 }))).toBe(32);
  });
  it("la altura es estable y va de 66 a 95", () => {
    expect(spineHeight("abc")).toBe(spineHeight("abc"));
    for (const id of ["a", "bb", "ccc", "uuid-1234"]) {
      expect(spineHeight(id)).toBeGreaterThanOrEqual(66);
      expect(spineHeight(id)).toBeLessThanOrEqual(95);
    }
  });
  it("etiqueta de episodios de la serie e iniciales", () => {
    expect(seriesLabel(item({ itemType: "series", totalEpisodes: 26 }))).toBe("26 ep.");
    expect(seriesLabel(item({ itemType: "series", totalEpisodes: 5 }))).toBe("5 ep.");
    expect(seriesLabel(item({ itemType: "series", totalEpisodes: null }))).toBe("Serie");
    expect(initials("Juan Rulfo")).toBe("JR");
    expect(initials("de la Cruz")).toBe("C");
  });
});

describe("sampleFromShelf", () => {
  const many = Array.from({ length: 30 }, (_, k) => item({ itemId: `id-${k}` }));
  const keys = (ids: number[]) => new Set(ids.map((k) => `book:id-${k}`));

  it("con elegibles en la balda, los candidatos salen de la balda", () => {
    const shelf = keys([3, 7, 11, 19, 25]);
    for (let r = 0; r < 20; r++) {
      const got = sampleFromShelf(many, shelf);
      expect(got).toHaveLength(3);
      for (const c of got) expect(shelf.has(`book:${c.itemId}`)).toBe(true);
    }
  });
  it("si en la balda hay menos de tres, primero esos y se completa con los demás", () => {
    const got = sampleFromShelf(many, keys([4]));
    expect(got).toHaveLength(3);
    expect(got[0].itemId).toBe("id-4");
    expect(new Set(got.map((c) => c.itemId)).size).toBe(3);
  });
  it("sin ninguno en la balda, sortea entre todos los elegibles", () => {
    expect(sampleFromShelf(many, new Set())).toHaveLength(3);
    expect(sampleFromShelf(many.slice(0, 2), new Set())).toHaveLength(2);
  });
});
