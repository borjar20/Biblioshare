import { describe, expect, it } from "vitest";
import { buildMarginAnchor } from "./anchor";

describe("buildMarginAnchor", () => {
  it("libro con páginas → ratio", () => {
    expect(buildMarginAnchor({ itemType: "book", page: 214, pages: 400 })).toEqual({
      ok: true,
      anchor: { kind: "ratio", ratio: 0.535, page: 214, pages: 400 },
    });
  });
  it("libro sin página → al terminar", () => {
    expect(buildMarginAnchor({ itemType: "book", page: null, pages: 400 })).toEqual({
      ok: true,
      anchor: { kind: "finish" },
    });
  });
  it("libro sin páginas conocidas → al terminar", () => {
    expect(buildMarginAnchor({ itemType: "book", page: 10, pages: null })).toEqual({
      ok: true,
      anchor: { kind: "finish" },
    });
  });
  it("página fuera de rango → error", () => {
    expect(buildMarginAnchor({ itemType: "book", page: 401, pages: 400 })).toEqual({ ok: false, error: "invalidPosition" });
    expect(buildMarginAnchor({ itemType: "book", page: 0, pages: 400 })).toEqual({ ok: false, error: "invalidPosition" });
    expect(buildMarginAnchor({ itemType: "book", page: 2.5, pages: 400 })).toEqual({ ok: false, error: "invalidPosition" });
  });
  it("serie con episodio → episode; sin episodio → al terminar", () => {
    expect(buildMarginAnchor({ itemType: "series", season: 1, episode: 3 })).toEqual({
      ok: true,
      anchor: { kind: "episode", season: 1, episode: 3 },
    });
    expect(buildMarginAnchor({ itemType: "series", season: null, episode: null })).toEqual({
      ok: true,
      anchor: { kind: "finish" },
    });
    expect(buildMarginAnchor({ itemType: "series", season: 1, episode: 0 })).toEqual({ ok: false, error: "invalidPosition" });
  });
  it("película → siempre al terminar", () => {
    expect(buildMarginAnchor({ itemType: "movie" })).toEqual({ ok: true, anchor: { kind: "finish" } });
  });
});
