import { describe, it, expect } from "vitest";
import { groupBookEditions } from "./group-editions";
import type { SearchResult } from "./types";

function book(partial: Partial<SearchResult> & { title: string }): SearchResult {
  return {
    itemType: "book",
    externalId: Math.random().toString(36).slice(2),
    title: partial.title,
    subtitle: partial.subtitle ?? null,
    coverUrl: partial.coverUrl ?? null,
    year: partial.year ?? null,
    synopsis: partial.synopsis ?? null,
    genres: null,
    publisher: partial.publisher ?? null,
    pageCount: partial.pageCount ?? null,
    isbn: partial.isbn ?? null,
    catalogId: partial.catalogId,
  };
}

describe("groupBookEditions", () => {
  it("colapsa ediciones de la misma obra y cuenta cuántas", () => {
    const results = [
      book({ title: "La casa de los espíritus", subtitle: "Isabel Allende" }),
      book({ title: "La Casa De Los Espíritus", subtitle: "Isabel Allende, prólogo" }),
      book({ title: "Rayuela", subtitle: "Julio Cortázar" }),
    ];
    const grouped = groupBookEditions(results);
    expect(grouped).toHaveLength(2);
    const casa = grouped.find((r) => r.title.toLowerCase().startsWith("la casa"));
    expect(casa?.editionCount).toBe(2);
    const rayuela = grouped.find((r) => r.title === "Rayuela");
    expect(rayuela?.editionCount).toBeUndefined(); // obra única, sin badge
  });

  it("elige como representante la edición más completa", () => {
    const results = [
      book({ title: "Dune", subtitle: "Frank Herbert" }), // sin metadata
      book({
        title: "Dune",
        subtitle: "Frank Herbert",
        coverUrl: "http://x/c.jpg",
        synopsis: "Arrakis...",
        pageCount: 412,
      }),
    ];
    const grouped = groupBookEditions(results);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].coverUrl).toBe("http://x/c.jpg");
    expect(grouped[0].pageCount).toBe(412);
    expect(grouped[0].editionCount).toBe(2);
  });

  it("distingue obras homónimas de distinto autor", () => {
    const results = [
      book({ title: "Cosmos", subtitle: "Carl Sagan" }),
      book({ title: "Cosmos", subtitle: "Witold Gombrowicz" }),
    ];
    expect(groupBookEditions(results)).toHaveLength(2);
  });
});
