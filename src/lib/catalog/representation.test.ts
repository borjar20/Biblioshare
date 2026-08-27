import { describe, expect, it } from "vitest";
import {
  authorMatches,
  langRank,
  needsRepresentationReview,
  pickField,
  synopsisLang,
  type HydrateFields,
} from "./representation";

const days = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

describe("langRank", () => {
  it("es<en<other<unknown", () => {
    expect([langRank("es"), langRank("en"), langRank("other"), langRank(undefined)]).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("un idioma que no es de la política (fr) cuenta como desconocido", () => {
    expect(langRank("fr")).toBe(3);
  });
});

describe("needsRepresentationReview", () => {
  it("sin hidratar → true", () => expect(needsRepresentationReview(null, null)).toBe(true));

  it("todo ES reciente → false", () =>
    expect(
      needsRepresentationReview(days(1), {
        title: { lang: "es" },
        cover: { lang: "es" },
        synopsis: { lang: "es" },
      }),
    ).toBe(false));

  it("título EN pero hidratado hace poco → false (cooldown)", () =>
    expect(
      needsRepresentationReview(days(1), {
        title: { lang: "en" },
        cover: { lang: "es" },
        synopsis: { lang: "es" },
      }),
    ).toBe(false));

  it("título EN e hidratación vieja → true", () =>
    expect(
      needsRepresentationReview(days(45), {
        title: { lang: "en" },
        cover: { lang: "es" },
        synopsis: { lang: "es" },
      }),
    ).toBe(true));

  it("todo ES pero viejo → false (no hay nada que mejorar)", () =>
    expect(
      needsRepresentationReview(days(400), {
        title: { lang: "es" },
        cover: { lang: "es" },
        synopsis: { lang: "es" },
      }),
    ).toBe(false));

  it("un campo que falta cuenta como hueco mejorable", () =>
    expect(
      needsRepresentationReview(days(45), { title: { lang: "es" }, cover: { lang: "es" } }),
    ).toBe(true));

  it("la curación manual no es un hueco, aunque no declare idioma", () =>
    expect(
      needsRepresentationReview(days(400), {
        title: { source: "manual" },
        cover: { source: "manual" },
        synopsis: { source: "manual" },
      }),
    ).toBe(false));

  it("una fecha de hidratación ilegible se reconsidera, no se da por reciente", () =>
    expect(needsRepresentationReview("no es una fecha", { title: { lang: "en" } })).toBe(true));
});

describe("pickField", () => {
  it("gana la primera opción con valor, no la última", () => {
    const fields: HydrateFields = {};
    pickField(fields, "title", [
      { value: "Palabras radiantes", lang: "es", source: "openlibrary" },
      { value: "Words of Radiance", lang: "en", source: "openlibrary" },
    ]);
    expect(fields.title).toEqual({
      value: "Palabras radiantes",
      lang: "es",
      source: "openlibrary",
    });
  });

  it("salta las opciones vacías, nulas o en blanco", () => {
    const fields: HydrateFields = {};
    pickField(fields, "title", [
      { value: null, lang: "es", source: "openlibrary" },
      { value: "   ", lang: "es", source: "wikidata" },
      { value: "Words of Radiance", lang: "en", source: "openlibrary" },
    ]);
    expect(fields.title).toEqual({ value: "Words of Radiance", lang: "en", source: "openlibrary" });
  });

  it("sin ninguna opción con valor no escribe el campo", () => {
    const fields: HydrateFields = {};
    pickField(fields, "cover", [{ value: undefined, lang: "es", source: "openlibrary" }]);
    expect(fields).toEqual({});
  });
});

describe("authorMatches", () => {
  it("casa el mismo autor aunque venga con traductor detrás de la coma", () => {
    expect(authorMatches("Brandon Sanderson, Rafael Marín Trechera", "Brandon Sanderson")).toBe(
      true,
    );
  });

  // La cota del 65% de isSameTitle: sin ella «Ana» casaría con «Susana Fortes»
  // solo por ser substring, que es el fallo que tumbó dos veces este plan.
  it("un nombre corto NO casa con otro que solo lo contiene", () => {
    expect(authorMatches("Ana", "Susana Fortes")).toBe(false);
  });

  it("un nombre que normaliza a vacío no casa con nada", () => {
    expect(authorMatches("—", "Brandon Sanderson")).toBe(false);
  });

  it("sin autor conocido no hay match (falla cerrado)", () => {
    expect(authorMatches(null, "Brandon Sanderson")).toBe(false);
    expect(authorMatches("Brandon Sanderson", null)).toBe(false);
  });

  it("tolera acentos y mayúsculas distintos", () => {
    expect(authorMatches("gabriel garcia marquez", "Gabriel García Márquez")).toBe(true);
  });
});

describe("synopsisLang", () => {
  it("sin sinopsis → other, con sinopsis → en (OL casi nunca la tiene en español)", () => {
    expect(synopsisLang(null)).toBe("other");
    expect(synopsisLang("A tale of two cities")).toBe("en");
  });
});
