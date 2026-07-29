import { describe, expect, it } from "vitest";
import { filterSagaIndex, type SagaIndexFilterParams } from "./filter-saga-index";
import type { SagaIndexCard } from "./build-saga-index";

const baseParams: SagaIndexFilterParams = {
  vista: "todas",
  tipos: [],
  itinerarios: false,
  coleccion: false,
  min5: false,
};

const card = (overrides: Partial<SagaIndexCard>): SagaIndexCard => ({
  id: "id",
  name: "Nombre",
  coverUrl: null,
  accent: "terracota",
  titleCount: 3,
  children: [],
  typeBreakdown: { book: 3, movie: 0, series: 0 },
  hasGraph: false,
  routeCount: 0,
  progress: null,
  ownedCount: 0,
  isFollowed: false,
  ...overrides,
});

describe("filterSagaIndex", () => {
  it("sin filtros, devuelve todo igual", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    expect(filterSagaIndex(cards, baseParams)).toEqual(cards);
  });

  it("vista=sigo deja solo isFollowed", () => {
    const cards = [card({ id: "a", isFollowed: true }), card({ id: "b", isFollowed: false })];
    expect(filterSagaIndex(cards, { ...baseParams, vista: "sigo" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("vista=universos deja solo sagas con subsagas", () => {
    const cards = [
      card({ id: "a", children: [{ id: "x", name: "X", accent: "verde" }] }),
      card({ id: "b", children: [] }),
    ];
    expect(filterSagaIndex(cards, { ...baseParams, vista: "universos" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("tipo filtra por OR entre los tipos marcados", () => {
    const cards = [
      card({ id: "a", typeBreakdown: { book: 1, movie: 0, series: 0 } }),
      card({ id: "b", typeBreakdown: { book: 0, movie: 1, series: 0 } }),
      card({ id: "c", typeBreakdown: { book: 0, movie: 0, series: 1 } }),
    ];
    expect(
      filterSagaIndex(cards, { ...baseParams, tipos: ["libro", "pelicula"] }).map((c) => c.id),
    ).toEqual(["a", "b"]);
  });

  it("itinerarios exige routeCount > 0", () => {
    const cards = [card({ id: "a", routeCount: 1 }), card({ id: "b", routeCount: 0 })];
    expect(filterSagaIndex(cards, { ...baseParams, itinerarios: true }).map((c) => c.id)).toEqual(["a"]);
  });

  it("coleccion exige ownedCount > 0", () => {
    const cards = [card({ id: "a", ownedCount: 2 }), card({ id: "b", ownedCount: 0 })];
    expect(filterSagaIndex(cards, { ...baseParams, coleccion: true }).map((c) => c.id)).toEqual(["a"]);
  });

  it("min5 exige titleCount >= 5", () => {
    const cards = [card({ id: "a", titleCount: 5 }), card({ id: "b", titleCount: 4 })];
    expect(filterSagaIndex(cards, { ...baseParams, min5: true }).map((c) => c.id)).toEqual(["a"]);
  });

  it("los filtros se combinan por AND", () => {
    const cards = [
      card({ id: "a", isFollowed: true, routeCount: 1 }),
      card({ id: "b", isFollowed: true, routeCount: 0 }),
      card({ id: "c", isFollowed: false, routeCount: 1 }),
    ];
    expect(
      filterSagaIndex(cards, { ...baseParams, vista: "sigo", itinerarios: true }).map((c) => c.id),
    ).toEqual(["a"]);
  });
});
