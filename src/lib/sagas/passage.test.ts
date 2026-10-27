import { describe, expect, it } from "vitest";
import { derivePassage, sagaOptionalFigure, type PassRow, type PassageInput } from "./passage";

const p = (key: string, extra: Partial<PassRow> = {}): PassRow => {
  const [itemType, itemId] = key.split(":") as [PassRow["itemType"], string];
  return { itemType, itemId, status: "completed", rating: null, startedOn: null, finishedOn: null, createdAt: "2026-01-01T00:00:00Z", ...extra };
};
const o = (key: string, extra: Partial<PassageInput["order"][number]> = {}) => ({ key, title: key.toUpperCase(), href: `/x/${key}`, coverUrl: `/c/${key}.jpg`, optional: false, skipped: false, ...extra });

describe("derivePassage", () => {
  it("sin pases devuelve null", () => {
    expect(derivePassage({ passes: [], sizes: new Map(), order: [o("book:a")] })).toBeNull();
  });

  it("since es la fecha más antigua entre inicio, fin y alta", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { startedOn: "2025-03-10", finishedOn: "2025-04-01" }),
        p("book:b", { finishedOn: "2024-12-01" }),
        p("book:c", { status: "planned", createdAt: "2024-06-05T10:00:00Z" }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b"), o("book:c")],
    });
    expect(r?.since).toBe("2024-06-05");
  });

  it("cuenta terminadas y en curso por obra, sin dropped ni planned", () => {
    const r = derivePassage({
      passes: [
        p("book:a"), p("book:a", { createdAt: "2026-02-01T00:00:00Z" }),
        p("book:b", { status: "in_progress" }),
        p("book:c", { status: "completed" }), p("book:c", { status: "in_progress" }),
        p("book:d", { status: "dropped", finishedOn: "2026-01-02" }),
        p("book:e", { status: "planned" }),
      ],
      sizes: new Map(), order: [],
    });
    expect([r?.completed, r?.inProgress]).toEqual([2, 1]);
  });

  it("la nota de una obra es la del pase terminado más reciente, aunque sea nula", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { rating: 8, finishedOn: "2025-01-01" }),
        p("book:a", { rating: null, finishedOn: "2026-01-01" }),
        p("book:b", { rating: 6, finishedOn: "2025-05-01" }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b")],
    });
    expect(r?.average).toBe(6);
    expect(r?.curve).toEqual([{ x: 1, rating: 6, key: "book:b", title: "BOOK:B" }]);
  });

  it("un pase terminado sin fecha es anterior a cualquiera con fecha; entre sin fecha decide el alta", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { rating: 8, finishedOn: "2020-01-01" }),
        p("book:a", { rating: 5, finishedOn: null }),
        p("book:b", { rating: 3, createdAt: "2026-01-01T00:00:00Z" }),
        p("book:b", { rating: 9, createdAt: "2026-03-01T00:00:00Z" }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b")],
    });
    expect(r?.curve.map((c) => [c.key, c.rating])).toEqual([["book:a", 8], ["book:b", 9]]);
  });

  it("favorita: la nota más alta; el empate lo gana la terminada más reciente", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { rating: 9, finishedOn: "2025-01-01" }),
        p("book:b", { rating: 9, finishedOn: "2025-06-01" }),
        p("book:c", { rating: 7, finishedOn: "2026-01-01" }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b"), o("book:c")],
    });
    expect(r?.favorite).toEqual({ key: "book:b", title: "BOOK:B", href: "/x/book:b", rating: 9 });
    expect(r?.average).toBeCloseTo(25 / 3);
  });

  it("páginas y minutos: suma de lo conocido y sobre cuántas", () => {
    const r = derivePassage({
      passes: [p("book:a"), p("book:b"), p("movie:m"), p("series:s"), p("book:c", { status: "in_progress" })],
      sizes: new Map([
        ["book:a", { pages: 300, minutes: null }],
        ["book:b", { pages: null, minutes: null }],
        ["movie:m", { pages: null, minutes: 120 }],
      ]),
      order: [],
    });
    expect(r?.pages).toEqual({ total: 300, known: 1, of: 2 });
    expect(r?.minutes).toEqual({ total: 120, known: 1, of: 1 });
  });

  it("sin libros terminados, pages es null", () => {
    const r = derivePassage({ passes: [p("movie:m")], sizes: new Map(), order: [] });
    expect(r?.pages).toBeNull();
  });

  it("las opcionales saltadas vienen de la saga, no del orden de la balda", () => {
    // La balda no trae las opcionales (preferencia «ocultar»): la cifra no depende de ella.
    const r = derivePassage({
      passes: [p("book:a")], sizes: new Map(), order: [o("book:a")],
      optional: { skipped: 1, total: 2 },
    });
    expect(r?.optional).toEqual({ skipped: 1, total: 2 });
    expect(r?.curveLength).toBe(1);
  });

  it("sin opcionales, optional es null", () => {
    expect(derivePassage({ passes: [p("book:a")], sizes: new Map(), order: [o("book:a")] })?.optional).toBeNull();
  });

  it("countedAverage excluye las opcionales; average las incluye", () => {
    const r = derivePassage({
      passes: [p("book:a", { rating: 8 }), p("book:x", { rating: 2 })], sizes: new Map(),
      order: [o("book:a")], optionalKeys: new Set(["book:x"]),
    });
    expect(r?.average).toBe(5);
    expect(r?.countedAverage).toBe(8);
  });

  it("countedAverage es null si solo hay nota en opcionales", () => {
    const r = derivePassage({
      passes: [p("book:x", { rating: 2 })], sizes: new Map(), order: [],
      optionalKeys: new Set(["book:x"]),
    });
    expect(r?.average).toBe(2);
    expect(r?.countedAverage).toBeNull();
  });
});

describe("sagaOptionalFigure", () => {
  const m = (itemId: string, optional: boolean, skipped: boolean) => ({ itemType: "book" as const, itemId, optional, skipped });
  it("cuenta opcionales distintas y saltadas, deduplicando por tipo:id", () => {
    const f = sagaOptionalFigure([m("a", false, false), m("x", true, true), m("x", true, false), m("y", true, false)]);
    expect(f.optional).toEqual({ skipped: 1, total: 2 });
    expect([...f.optionalKeys].sort()).toEqual(["book:x", "book:y"]);
  });
  it("sin opcionales devuelve null", () => {
    expect(sagaOptionalFigure([m("a", false, false)]).optional).toBeNull();
  });

  it("reparto: cinco niveles de 5 a 1; el medio punto sube y cada nivel guarda sus obras en el orden de la balda", () => {
    const r = derivePassage({
      passes: [
        p("book:a", { rating: 10 }), p("book:b", { rating: 7 }), p("book:c", { rating: 8 }),
        p("book:d", { rating: 1 }), p("book:e", { rating: null }),
      ],
      sizes: new Map(), order: [o("book:a"), o("book:b"), o("book:c"), o("book:d"), o("book:e")],
    });
    expect(r?.distribution.map((d) => [d.level, d.works.map((w) => w.key)])).toEqual([
      [5, ["book:a"]], [4, ["book:b", "book:c"]], [3, []], [2, []], [1, ["book:d"]],
    ]);
    expect(r?.distribution[0].works[0]).toEqual({ key: "book:a", title: "BOOK:A", href: "/x/book:a", coverUrl: "/c/book:a.jpg" });
  });
});
