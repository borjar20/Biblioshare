import { describe, expect, it } from "vitest";
import { mapWorkCovers } from "./covers";

describe("mapWorkCovers", () => {
  it("mapea cada cover id a una URL de tamaño L", () => {
    expect(mapWorkCovers([123, 456])).toEqual([
      "https://covers.openlibrary.org/b/id/123-L.jpg",
      "https://covers.openlibrary.org/b/id/456-L.jpg",
    ]);
  });

  it("filtra ids no positivos (OpenLibrary usa -1 como 'sin portada')", () => {
    expect(mapWorkCovers([-1, 0, 789])).toEqual([
      "https://covers.openlibrary.org/b/id/789-L.jpg",
    ]);
  });

  it("undefined/null -> []", () => {
    expect(mapWorkCovers(undefined)).toEqual([]);
    expect(mapWorkCovers(null)).toEqual([]);
  });
});
