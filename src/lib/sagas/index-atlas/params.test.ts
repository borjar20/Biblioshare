import { describe, expect, it } from "vitest";
import { hasFilters, indexQueryString, matchesFilters, matchesQuery, NO_FILTERS, parseIndexParams } from "./params";

const from = (qs: string) => {
  const sp = new URLSearchParams(qs);
  return parseIndexParams((n) => sp.get(n));
};

describe("parseIndexParams", () => {
  it("lee filtros, búsqueda y foco", () => {
    expect(from("q=%20Mundo%20&tipo=libro,serie,nada&itinerarios=1&coleccion=1&min5=1&vista=sigo")).toEqual({
      q: "Mundo",
      filters: { tipos: ["libro", "serie"], itinerarios: true, coleccion: true, min5: true },
      focus: "sigues",
    });
  });
  it("vista=universos enfoca universos; todas, n y lo desconocido se ignoran", () => {
    expect(from("vista=universos").focus).toBe("universos");
    expect(from("vista=todas&n=48")).toEqual({ q: "", filters: NO_FILTERS, focus: null });
  });
});

describe("indexQueryString", () => {
  it("omite lo que está por defecto y no escribe la vista", () => {
    expect(indexQueryString({ q: "", filters: NO_FILTERS })).toBe("");
    expect(indexQueryString({ q: "ab c", filters: { ...NO_FILTERS, tipos: ["pelicula"], min5: true } })).toBe("q=ab+c&tipo=pelicula&min5=1");
  });
});

describe("matchesFilters", () => {
  const s = { typeBreakdown: { book: 3, movie: 0, series: 0 }, routeCount: 0, ownedCount: 2, titleCount: 3 };
  it("sin filtros coincide todo", () => expect(matchesFilters(s, NO_FILTERS)).toBe(true));
  it("tipo: basta con uno de los elegidos", () => {
    expect(matchesFilters(s, { ...NO_FILTERS, tipos: ["pelicula", "libro"] })).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, tipos: ["serie"] })).toBe(false);
  });
  it("itinerarios, colección y ≥5", () => {
    expect(matchesFilters(s, { ...NO_FILTERS, itinerarios: true })).toBe(false);
    expect(matchesFilters(s, { ...NO_FILTERS, coleccion: true })).toBe(true);
    expect(matchesFilters(s, { ...NO_FILTERS, min5: true })).toBe(false);
  });
  it("los filtros se combinan por AND", () => {
    const f = { ...NO_FILTERS, tipos: ["libro" as const], coleccion: true };
    expect(matchesFilters(s, f)).toBe(true);
    expect(matchesFilters(s, { ...f, itinerarios: true })).toBe(false);
    expect(matchesFilters({ ...s, ownedCount: 0 }, f)).toBe(false);
  });
  it("hasFilters", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, coleccion: true })).toBe(true);
  });
});

describe("matchesQuery", () => {
  const s = { name: "Mundodisco", children: [{ name: "La Guardia" }, { name: "Las brujas" }] };
  it("sin tildes ni mayúsculas, en la saga o en sus subsagas", () => {
    expect(matchesQuery(s, "")).toBe(true);
    expect(matchesQuery(s, "MUNDO")).toBe(true);
    expect(matchesQuery(s, "guardía")).toBe(true);
    expect(matchesQuery(s, "cosmere")).toBe(false);
  });
});
