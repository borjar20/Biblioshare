import { describe, expect, it } from "vitest";
import { mergeByExternalId } from "./merge-results";
import type { SearchResult } from "./types";

function book(externalId: string, title: string, catalogId?: string): SearchResult {
  return {
    itemType: "book",
    externalId,
    catalogId,
    title,
    subtitle: null,
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
  };
}

describe("mergeByExternalId", () => {
  it("una obra que ya está en el catálogo aparece UNA vez, con su catalogId", () => {
    const local = [book("/works/OL1W", "Dune", "uuid-1")];
    const api = [book("/works/OL1W", "Dune"), book("/works/OL2W", "Dune Messiah")];

    const merged = mergeByExternalId(local, api);

    expect(merged).toHaveLength(2);
    expect(merged[0].catalogId).toBe("uuid-1");
    expect(merged[1].externalId).toBe("/works/OL2W");
    expect(merged[1].catalogId).toBeUndefined();
  });

  it("lo local va primero: es lo que el usuario ya tiene", () => {
    const local = [book("/works/OL9W", "El nombre del viento", "uuid-9")];
    const api = [
      book("/works/OL2W", "Otra"),
      book("/works/OL9W", "El nombre del viento"),
    ];

    expect(mergeByExternalId(local, api).map((r) => r.externalId)).toEqual([
      "/works/OL9W",
      "/works/OL2W",
    ]);
  });

  it("un libro local SIN work key (creado a mano, importado) no se pierde", () => {
    const local = [book("", "Libro casero", "uuid-x")];
    const api = [book("/works/OL1W", "Dune")];

    const merged = mergeByExternalId(local, api);

    expect(merged).toHaveLength(2);
    expect(merged[0].catalogId).toBe("uuid-x");
  });

  it("la API caída deja solo los resultados locales", () => {
    const local = [book("/works/OL1W", "Dune", "uuid-1")];
    expect(mergeByExternalId(local, [])).toHaveLength(1);
  });

  it("sin nada local, devuelve la API tal cual", () => {
    const api = [book("/works/OL1W", "Dune")];
    expect(mergeByExternalId([], api)).toEqual(api);
  });
});
