import { describe, expect, it } from "vitest";
import { pickSagaHeroBackground } from "./hero-background";

describe("pickSagaHeroBackground", () => {
  it("el backdrop de TMDB manda", () => {
    expect(pickSagaHeroBackground({ backdropUrl: "/b.jpg", covers: ["/a.jpg"] })).toEqual({ kind: "backdrop", src: "/b.jpg" });
  });
  it("sin backdrop, mosaico de hasta 12 portadas, repetidas si hay menos de 6", () => {
    const r = pickSagaHeroBackground({ backdropUrl: null, covers: ["/1", "/2", "/3"] });
    expect(r).toEqual({ kind: "mosaic", covers: ["/1", "/2", "/3", "/1", "/2", "/3"] });
    const many = pickSagaHeroBackground({ backdropUrl: null, covers: Array.from({ length: 20 }, (_, i) => `/${i}`) });
    expect(many.kind === "mosaic" && many.covers).toHaveLength(12);
  });
  it("sin nada, none", () => {
    expect(pickSagaHeroBackground({ backdropUrl: null, covers: [] })).toEqual({ kind: "none" });
  });
});
