import { describe, expect, it } from "vitest";
import { HERO_MOSAIC_SIZE, pickHero } from "./hero";
import type { ProfileCover } from "./types";

const c = (id: string): ProfileCover => ({ itemType: "book", itemId: id, title: id, coverUrl: null, href: `/libro/${id}` });

describe("pickHero", () => {
  it("el abanico son los destacados y el mosaico, las terminadas que no están en él", () => {
    const hero = pickHero([c("a"), c("b")], [c("a"), c("x"), c("y"), c("z")]);
    expect(hero.fan.map((x) => x.itemId)).toEqual(["a", "b"]);
    expect(new Set(hero.mosaic.map((x) => x.itemId))).toEqual(new Set(["x", "y", "z"]));
  });

  it("el mosaico se llena en ciclo hasta su tamaño", () => {
    const hero = pickHero([], [c("x"), c("y"), c("z")]);
    expect(hero.mosaic).toHaveLength(HERO_MOSAIC_SIZE);
    expect(hero.mosaic.slice(0, 4).map((x) => x.itemId)).toEqual(["x", "y", "z", "x"]);
  });

  it("sin destacados, el abanico son las últimas terminadas", () => {
    const hero = pickHero([], [c("x"), c("y"), c("z"), c("w"), c("v"), c("u"), c("t")]);
    expect(hero.fan.map((x) => x.itemId)).toEqual(["x", "y", "z", "w", "v", "u"]);
  });

  it("con menos de 3 terminadas no hay mosaico", () => {
    expect(pickHero([c("a")], [c("x"), c("y")]).mosaic).toEqual([]);
  });

  it("si todas las terminadas están en el abanico, el mosaico las repite", () => {
    const hero = pickHero([], [c("x"), c("y"), c("z")]);
    expect(hero.mosaic.length).toBe(HERO_MOSAIC_SIZE);
  });

  it("cuenta nueva: ni abanico ni mosaico", () => {
    expect(pickHero([], [])).toEqual({ fan: [], mosaic: [] });
  });
});
