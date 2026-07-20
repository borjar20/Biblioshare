import { describe, expect, it } from "vitest";
import { rankSuggestions, type SuggestionCandidate } from "./rank-suggestions";

const c = (over: Partial<SuggestionCandidate>): SuggestionCandidate => ({
  itemType: "book",
  itemId: over.itemId ?? "x",
  title: over.title ?? "Título",
  coverUrl: "https://ejemplo/portada.jpg",
  year: 2020,
  readers: 0,
  ...over,
});

describe("rankSuggestions", () => {
  it("descarta lo que no tiene portada", () => {
    const out = rankSuggestions(
      [c({ itemId: "sin", coverUrl: null }), c({ itemId: "con" })],
      ["book"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["con"]);
  });

  it("descarta lo que no tiene año", () => {
    const out = rankSuggestions(
      [c({ itemId: "sin", year: null }), c({ itemId: "con" })],
      ["book"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["con"]);
  });

  it("filtra por intereses", () => {
    const out = rankSuggestions(
      [
        c({ itemId: "libro", itemType: "book" }),
        c({ itemId: "peli", itemType: "movie" }),
      ],
      ["movie"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["peli"]);
  });

  it("intereses vacíos = los tres tipos, nunca ninguno", () => {
    const out = rankSuggestions(
      [
        c({ itemId: "libro", itemType: "book" }),
        c({ itemId: "peli", itemType: "movie" }),
      ],
      [],
    );
    expect(out).toHaveLength(2);
  });

  it("ordena por lectores descendente", () => {
    const out = rankSuggestions(
      [c({ itemId: "pocos", readers: 1 }), c({ itemId: "muchos", readers: 9 })],
      ["book"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["muchos", "pocos"]);
  });

  it("empate a lectores: desempata por título, para que el orden sea estable", () => {
    const out = rankSuggestions(
      [
        c({ itemId: "b", title: "Beta", readers: 2 }),
        c({ itemId: "a", title: "Alfa", readers: 2 }),
      ],
      ["book"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["a", "b"]);
  });

  it("respeta el límite", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      c({ itemId: `i${i}`, readers: 30 - i }),
    );
    expect(rankSuggestions(many, ["book"], 12)).toHaveLength(12);
  });
});
