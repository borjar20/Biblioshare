import { describe, expect, it } from "vitest";
import type { SagaIndexCard } from "../build-saga-index";
import { deriveIndexAtlas, orderedSagas } from "./model";

function card(id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard {
  return {
    id, name: id.toUpperCase(), coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
    typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
    progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
    started: false, lastTouchedAt: null, ...extra,
  };
}
const zoneOf = (m: ReturnType<typeof deriveIndexAtlas>) =>
  Object.fromEntries(m.zones.flatMap((z) => z.sagas.map((s) => [s.id, z.key])));

describe("deriveIndexAtlas con sesión", () => {
  it("cada regla de zona, con su prioridad", () => {
    const m = deriveIndexAtlas([
      card("curso", { started: true, isFollowed: true, progress: { completed: 1, total: 3, pct: 33, readingLabel: null } }),
      card("sigo", { isFollowed: true }),
      card("hecha", { started: true, isFollowed: true, progress: { completed: 3, total: 3, pct: 100, readingLabel: null } }),
      card("nueva"),
      card("soloopc", { progress: { completed: 0, total: 0, pct: 0, readingLabel: null } }),
    ], true);
    expect(zoneOf(m)).toEqual({ curso: "en-curso", sigo: "sigues", hecha: "terminadas", nueva: "por-descubrir", soloopc: "por-descubrir" });
    expect(m.zones.map((z) => z.key)).toEqual(["en-curso", "sigues", "terminadas", "por-descubrir"]);
  });

  it("por descubrir: comarcas por tipo, con Mixtas, y más obras primero", () => {
    const m = deriveIndexAtlas([
      card("b1", { titleCount: 2 }),
      card("b2", { titleCount: 9 }),
      card("p1", { typeBreakdown: { book: 0, movie: 4, series: 0 }, titleCount: 4 }),
      card("mx", { typeBreakdown: { book: 1, movie: 1, series: 0 }, titleCount: 2 }),
      card("vacia", { typeBreakdown: { book: 0, movie: 0, series: 0 }, titleCount: 0 }),
    ], true);
    const pd = m.zones.find((z) => z.key === "por-descubrir")!;
    expect(pd.comarcas!.map((c) => [c.key, c.sagas.map((s) => s.id)])).toEqual([
      ["libros", ["b2", "b1"]], ["peliculas", ["p1"]], ["mixtas", ["mx", "vacia"]],
    ]);
    expect(pd.sagas.map((s) => s.id)).toEqual(["b2", "b1", "p1", "mx", "vacia"]);
    expect(pd.sagas.every((s) => s.comarca !== null)).toBe(true);
  });

  it("orden: en curso por último pase; sigues y terminadas alfabético", () => {
    const m = deriveIndexAtlas([
      card("a", { started: true, lastTouchedAt: "2026-01-01" }),
      card("b", { started: true, lastTouchedAt: "2026-05-01" }),
      card("z", { isFollowed: true, name: "Zeta" }),
      card("e", { isFollowed: true, name: "Época" }),
    ], true);
    expect(m.zones[0].sagas.map((s) => s.id)).toEqual(["b", "a"]);
    expect(m.zones[1].sagas.map((s) => s.name)).toEqual(["Época", "Zeta"]);
  });

  it("zonas vacías fuera; contadores", () => {
    const m = deriveIndexAtlas([card("u", { isFollowed: true, children: [{ id: "h", name: "H", accent: "beige", titleCount: 1 }] })], true);
    expect(m.zones.map((z) => z.key)).toEqual(["sigues"]);
    expect(m).toMatchObject({ sagaCount: 1, universeCount: 1, followedCount: 1, authenticated: true });
    expect(m.zones[0].sagas[0].children[0]).toEqual({ id: "h", name: "H", href: "/saga/h", accent: "beige", titleCount: 1 });
  });
});

describe("deriveIndexAtlas sin sesión", () => {
  it("zonas por tipo, aunque la tarjeta diga que la sigue", () => {
    const m = deriveIndexAtlas([
      card("b", { isFollowed: true }),
      card("s", { typeBreakdown: { book: 0, movie: 0, series: 2 }, titleCount: 2 }),
    ], false);
    expect(m.zones.map((z) => [z.key, z.comarcas])).toEqual([["libros", null], ["series", null]]);
    expect(m.zones[0].sagas[0]).toMatchObject({ zone: "libros", comarca: null, progress: null });
  });
});

describe("orderedSagas", () => {
  it("zona a zona, en su orden", () => {
    const m = deriveIndexAtlas([card("n"), card("c", { started: true })], true);
    expect(orderedSagas(m).map((s) => s.id)).toEqual(["c", "n"]);
  });
});
