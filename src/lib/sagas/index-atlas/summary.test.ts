import { describe, expect, it } from "vitest";
import type { SagaIndexCard } from "../build-saga-index";
import { deriveIndexAtlas } from "./model";
import { summarizeIndex } from "./summary";

const card = (id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard => ({
  id, name: id.toUpperCase(), coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
  typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
  progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
  started: false, lastTouchedAt: null, ...extra,
});

describe("summarizeIndex", () => {
  it("en curso: la primera y cuántas más, y cuántas sigues", () => {
    const m = deriveIndexAtlas([
      card("a", { started: true, lastTouchedAt: "2026-02" }), card("b", { started: true, lastTouchedAt: "2026-01" }),
      card("c", { isFollowed: true }), card("d"),
    ], true);
    expect(summarizeIndex(m, 4)).toEqual({ key: "enCurso", values: { name: "A", more: 1, followed: 1 } });
  });
  it("sin nada en curso: sigues y por descubrir", () => {
    const m = deriveIndexAtlas([card("c", { isFollowed: true }), card("d"), card("e")], true);
    expect(summarizeIndex(m, 3)).toEqual({ key: "sinCurso", values: { followed: 1, discover: 2 } });
  });
  it("sin sesión: sagas y universos", () => {
    const m = deriveIndexAtlas([card("u", { children: [{ id: "h", name: "H", accent: "beige", titleCount: 1 }] }), card("v")], false);
    expect(summarizeIndex(m, 2)).toEqual({ key: "anonimo", values: { sagas: 2, universes: 1 } });
  });
  it("nada coincide", () => {
    const m = deriveIndexAtlas([card("d")], true);
    expect(summarizeIndex(m, 0)).toEqual({ key: "sinCoincidencias", values: {} });
  });
});
