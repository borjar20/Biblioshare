import { describe, expect, it } from "vitest";
import { mapWorkDoc, normalizeSearchWorks } from "./search-normalize";
import searchHungerGamesEs from "./__fixtures__/search-hunger-games-es.json";
import searchHungerGamesEn from "./__fixtures__/search-hunger-games-en.json";
import searchEnLlamasEs from "./__fixtures__/search-en-llamas-es.json";
import searchEnLlamasEn from "./__fixtures__/search-en-llamas-en.json";

describe("mapWorkDoc", () => {
  it("mapea un doc de search.json como OBRA, sin datos de edición", () => {
    const result = mapWorkDoc({
      key: "/works/OL893415W",
      title: "Dune",
      author_name: ["Frank Herbert"],
      cover_i: 8100921,
      first_publish_year: 1965,
      edition_count: 312,
    });

    expect(result).toEqual({
      itemType: "book",
      externalId: "/works/OL893415W",
      title: "Dune",
      subtitle: "Frank Herbert",
      coverUrl: "https://covers.openlibrary.org/b/id/8100921-M.jpg",
      year: 1965,
      synopsis: null,
      genres: null,
      editionCount: 312,
    });
  });

  it("junta varios autores y tolera campos ausentes", () => {
    const result = mapWorkDoc({
      key: "/works/OL1W",
      title: "Buenos presagios",
      author_name: ["Terry Pratchett", "Neil Gaiman"],
    });

    expect(result.subtitle).toBe("Terry Pratchett, Neil Gaiman");
    expect(result.coverUrl).toBeNull();
    expect(result.year).toBeNull();
    expect(result.editionCount).toBe(1);
  });
});

// Un doc mínimo con edición: `language` en la obra para pasar el filtro de
// idioma, y una sola edición con su título y su idioma.
function doc(
  key: string,
  title: string,
  editionTitle: string,
  editionLang: string,
  editionCount = 1
) {
  return {
    key,
    title,
    edition_count: editionCount,
    language: ["eng", "spa"],
    editions: { docs: [{ title: editionTitle, language: [editionLang] }] },
  };
}

describe("normalizeSearchWorks · guarda de colisión", () => {
  it("anula un título de edición que reclaman dos obras distintas", () => {
    // Caso real de q="hunger games": search.json le da a Mockingjay y a Fatta
    // Eld la edición «The Hunger Games», porque es la que casa con la consulta.
    const results = normalizeSearchWorks(
      [],
      [
        doc("/works/OL1W", "Mockingjay", "The Hunger Games", "eng", 98),
        doc("/works/OL2W", "Fatta Eld", "The Hunger Games", "eng", 116),
      ]
    );

    expect(results.map((r) => r.title)).toEqual(["Mockingjay", "Fatta Eld"]);
    expect(results.map((r) => r.externalId)).toEqual(["/works/OL1W", "/works/OL2W"]);
  });

  it("acepta el título de edición cuando lo reclama una sola obra", () => {
    const results = normalizeSearchWorks(
      [doc("/works/OL2W", "Fatta Eld", "En llamas", "spa", 116)],
      []
    );

    expect(results[0].title).toBe("En llamas");
    expect(results[0].altTitles).toEqual(["Fatta Eld", "En llamas"]);
  });
});

describe("normalizeSearchWorks · idioma, omnibus y desduplicación", () => {
  it("descarta la obra sin ninguna edición en español ni inglés", () => {
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "Dena sutan", language: ["eus"], edition_count: 3 },
        { key: "/works/OL2W", title: "Dune", language: ["eng"], edition_count: 312 },
      ]
    );

    expect(results.map((r) => r.externalId)).toEqual(["/works/OL2W"]);
  });

  it("descarta la obra sin campo `language`", () => {
    const results = normalizeSearchWorks([], [{ key: "/works/OL1W", title: "Fantasma" }]);

    expect(results).toEqual([]);
  });

  it("descarta un estuche por su título de obra", () => {
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "The Hunger Games Trilogy", language: ["eng"] },
        { key: "/works/OL2W", title: "Mockingjay", language: ["eng"] },
      ]
    );

    expect(results.map((r) => r.externalId)).toEqual(["/works/OL2W"]);
  });

  it("NO descarta una obra por un título de edición envenenado que sea un estuche", () => {
    // Si el omnibus se evaluara antes de la guarda, esta edición —que casa con
    // la consulta y la reclaman dos obras— se llevaría por delante dos libros.
    const results = normalizeSearchWorks(
      [],
      [
        doc("/works/OL1W", "Mockingjay", "The Hunger Games Trilogy", "eng", 98),
        doc("/works/OL2W", "Fatta Eld", "The Hunger Games Trilogy", "eng", 116),
      ]
    );

    expect(results.map((r) => r.title)).toEqual(["Mockingjay", "Fatta Eld"]);
  });

  it("funde dos registros con el mismo título de OBRA y deja el de más ediciones", () => {
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "The Hunger Games", language: ["eng"], edition_count: 5 },
        { key: "/works/OL2W", title: "The Hunger games", language: ["eng"], edition_count: 142 },
      ]
    );

    expect(results).toHaveLength(1);
    expect(results[0].externalId).toBe("/works/OL2W");
  });

  it("NO funde dos obras que solo comparten un título de edición", () => {
    // Aquí la guarda NO salta —solo una obra reclama «The Hunger Games» como
    // título de edición—, así que Mockingjay se MUESTRA como «The Hunger
    // Games». La regla de la bibliografía cruzaría los conjuntos de títulos y
    // la borraría; la de búsqueda compara SOLO el título de obra, que sigue
    // siendo «Mockingjay», y las deja pasar a las dos.
    const results = normalizeSearchWorks(
      [],
      [
        { key: "/works/OL1W", title: "The Hunger Games", language: ["eng"], edition_count: 142 },
        doc("/works/OL3W", "Mockingjay", "The Hunger Games", "eng", 98),
      ]
    );

    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({ externalId: "/works/OL3W", title: "The Hunger Games" });
  });

  it("descarta docs sin key o sin título y recorta a 20 resultados", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      key: `/works/OL${i}W`,
      title: `Obra ${i}`,
      language: ["eng"],
      edition_count: 1,
    }));

    const results = normalizeSearchWorks(
      [],
      [{ title: "Sin key", language: ["eng"] }, { key: "/works/OLXW", language: ["eng"] }, ...many]
    );

    expect(results).toHaveLength(20);
    expect(results[0].externalId).toBe("/works/OL0W");
  });
});

describe("normalizeSearchWorks · fixtures reales", () => {
  it("q='hunger games': 40 docs por pasada dan 20 resultados", () => {
    const results = normalizeSearchWorks(
      searchHungerGamesEs.docs,
      searchHungerGamesEn.docs
    );

    expect(results).toHaveLength(20);
  });

  it("q='hunger games': Mockingjay y Catching Fire SIGUEN en la lista", () => {
    // La regresión que definió el diseño: con la desduplicación de la
    // bibliografía, estas dos obras desaparecen porque search.json les pone la
    // edición «The Hunger Games».
    const results = normalizeSearchWorks(
      searchHungerGamesEs.docs,
      searchHungerGamesEn.docs
    );

    expect(results[1]).toMatchObject({
      externalId: "/works/OL14908941W",
      title: "Mockingjay",
    });
    expect(results[2]).toMatchObject({
      externalId: "/works/OL36410330W",
      title: "Fatta Eld",
    });
  });

  it("q='hunger games': los registros repetidos de la obra se funden en uno", () => {
    const results = normalizeSearchWorks(
      searchHungerGamesEs.docs,
      searchHungerGamesEn.docs
    );

    expect(results[0].externalId).toBe("/works/OL5735363W");
    expect(results.filter((r) => r.title === "The Hunger Games")).toHaveLength(1);
  });

  it("q='en llamas': la MISMA obra sale con su título español", () => {
    // OL36410330W es «Fatta Eld» buscando «hunger games» y «En llamas»
    // buscando «en llamas»: la edición que search.json saca depende de la
    // consulta. Aquí la guarda no salta porque nadie más reclama ese título.
    const results = normalizeSearchWorks(searchEnLlamasEs.docs, searchEnLlamasEn.docs);

    const catchingFire = results.find((r) => r.externalId === "/works/OL36410330W");
    expect(catchingFire?.title).toBe("En llamas");
    expect(catchingFire?.altTitles).toContain("Fatta Eld");
  });

  it("q='en llamas': 40 docs por pasada dan 20 resultados", () => {
    const results = normalizeSearchWorks(searchEnLlamasEs.docs, searchEnLlamasEn.docs);

    expect(results).toHaveLength(20);
  });
});
