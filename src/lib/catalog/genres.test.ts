import { describe, expect, it } from "vitest";
import { mapSubjectsToGenres } from "./genres";

describe("mapSubjectsToGenres", () => {
  it("mapea subjects conocidos a géneros canónicos en español", () => {
    expect(mapSubjectsToGenres(["Science fiction"])).toEqual(["Ciencia ficción"]);
    expect(mapSubjectsToGenres(["Fantasy fiction"])).toEqual(["Fantasía"]);
    expect(mapSubjectsToGenres(["Biography"])).toEqual(["Biografía"]);
  });

  it("descarta el ruido de catalogación", () => {
    expect(
      mapSubjectsToGenres([
        "Accessible book",
        "Protected DAISY",
        "In library",
        "New York Times bestseller",
        "Translations into Spanish",
        "Large type books",
        "Reading Level-Grade 9",
      ])
    ).toEqual([]);
  });

  it("prefiere la regla más específica sobre la genérica", () => {
    // "science fiction" no puede caer en "Divulgación" por contener "science".
    expect(mapSubjectsToGenres(["Science fiction"])).toEqual(["Ciencia ficción"]);
    // "detective and mystery stories" es novela negra, no "Misterio" a secas.
    expect(mapSubjectsToGenres(["Detective and mystery stories"])).toEqual([
      "Novela negra",
    ]);
  });

  it("deduplica géneros y respeta el orden de los subjects", () => {
    expect(
      mapSubjectsToGenres(["Fantasy", "Epic fantasy", "Adventure stories"])
    ).toEqual(["Fantasía", "Aventura"]);
  });

  it("corta en 5 géneros", () => {
    const genres = mapSubjectsToGenres([
      "Fantasy",
      "Science fiction",
      "Horror",
      "Romance",
      "Poetry",
      "Biography",
      "History",
    ]);
    expect(genres).toHaveLength(5);
    expect(genres).toEqual([
      "Fantasía",
      "Ciencia ficción",
      "Terror",
      "Romance",
      "Poesía",
    ]);
  });

  it("es indiferente a mayúsculas y acentos", () => {
    expect(mapSubjectsToGenres(["FANTASÍA", "ciencia-ficción"])).toEqual([
      "Fantasía",
      "Ciencia ficción",
    ]);
  });

  it("tolera null y lista vacía", () => {
    expect(mapSubjectsToGenres(null)).toEqual([]);
    expect(mapSubjectsToGenres([])).toEqual([]);
  });
});
