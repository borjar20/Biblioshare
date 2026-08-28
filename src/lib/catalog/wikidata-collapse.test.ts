import { describe, expect, it } from "vitest";
import { collapseByWikidata } from "./wikidata-collapse";
import type { SearchResult } from "./types";

const base: SearchResult = {
  itemType: "book", externalId: "", title: "", subtitle: null,
  coverUrl: null, year: null, synopsis: null, genres: null,
};
const entity = {
  uri: "wd:Q8034469",
  labels: { es: "Palabras radiantes", en: "Words of Radiance" },
  authorNames: ["Brandon Sanderson"],
};

describe("collapseByWikidata", () => {
  it("funde dos works de OL que son la misma entidad, prefiriendo el local", () => {
    const local: SearchResult = { ...base, externalId: "/works/OL16813053W", catalogId: "uuid-1",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson", altTitles: ["Palabras Radiantes"] };
    const api: SearchResult = { ...base, externalId: "/works/OL38056408W",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson", altTitles: ["Palabras Radiantes"] };
    const out = collapseByWikidata([local, api], [entity]);
    expect(out).toHaveLength(1);
    expect(out[0].catalogId).toBe("uuid-1");
    expect(out[0].wikidataId).toBe("Q8034469");
  });
  it("NO funde si el autor no casa", () => {
    const a: SearchResult = { ...base, externalId: "/works/OL1W", title: "Palabras radiantes", subtitle: "Otro Autor" };
    const b: SearchResult = { ...base, externalId: "/works/OL2W", title: "Words of Radiance", subtitle: "Brandon Sanderson" };
    expect(collapseByWikidata([a, b], [entity])).toHaveLength(2);
  });
  it("respeta wikidataId ya persistido en el local aunque el título no case con el label", () => {
    const local: SearchResult = { ...base, externalId: "", catalogId: "uuid-2",
      wikidataId: "Q8034469", title: "Palabras radiantes (ed. col.)", subtitle: "Brandon Sanderson" };
    const api: SearchResult = { ...base, externalId: "/works/OL38056408W",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson" };
    const out = collapseByWikidata([local, api], [entity]);
    expect(out).toHaveLength(1);
    expect(out[0].catalogId).toBe("uuid-2");
  });

  // 🔴 Critical: un subtítulo de solo puntuación normaliza a la cadena vacía,
  // y una guarda puesta solo del lado del nombre de la entidad (`n.length > 0`)
  // deja pasar `"".includes(n)` como si fuera un match universal.
  it("NO funde si el subtítulo normaliza a vacío (solo puntuación)", () => {
    const a: SearchResult = { ...base, externalId: "/works/OL1W", title: "Palabras radiantes", subtitle: "—" };
    const b: SearchResult = { ...base, externalId: "/works/OL2W", title: "Words of Radiance", subtitle: "Brandon Sanderson" };
    expect(collapseByWikidata([a, b], [entity])).toHaveLength(2);
  });

  // 🟠 Important: la contención de substring sin cota de longitud cruza
  // fronteras de nombre ("susanafortes".includes("ana")). El caso bueno
  // (traductor incluido en la lista de autoría) debe seguir casando.
  it("NO funde por contención de substring sin cota (autor corto contenido en uno distinto)", () => {
    const otherEntity = {
      uri: "wd:Q999",
      labels: { es: "Un Libro", en: "A Book" },
      authorNames: ["Susana Fortes"],
    };
    const a: SearchResult = { ...base, externalId: "/works/OL1W", title: "Un Libro", subtitle: "Ana" };
    const b: SearchResult = { ...base, externalId: "/works/OL2W", title: "A Book", subtitle: "Susana Fortes" };
    expect(collapseByWikidata([a, b], [otherEntity])).toHaveLength(2);
  });

  it("SIGUE fundiendo cuando el subtítulo incluye traductor además del autor", () => {
    const a: SearchResult = { ...base, externalId: "/works/OL1W", title: "Palabras Radiantes",
      subtitle: "Brandon Sanderson, Rafael Marín" };
    const b: SearchResult = { ...base, externalId: "/works/OL2W", title: "Words of Radiance",
      subtitle: "Brandon Sanderson" };
    expect(collapseByWikidata([a, b], [entity])).toHaveLength(1);
  });

  // 🟠 Important: la regla del superviviente no tenía ningún test que la
  // distinguiera de "gana siempre el primero de la lista".
  it("el local con catalogId en SEGUNDA posición sigue ganando", () => {
    const api: SearchResult = { ...base, externalId: "/works/OL38056408W", title: "Palabras Radiantes",
      subtitle: "Brandon Sanderson" };
    const local: SearchResult = { ...base, externalId: "/works/OL16813053W", catalogId: "uuid-9",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson" };
    const out = collapseByWikidata([api, local], [entity]);
    expect(out).toHaveLength(1);
    expect(out[0].catalogId).toBe("uuid-9");
  });

  it("sin catalogId en ninguno, el empate lo gana el primero visto (mejor relevancia)", () => {
    const a: SearchResult = { ...base, externalId: "/works/OL1W", title: "Palabras Radiantes",
      subtitle: "Brandon Sanderson" };
    const b: SearchResult = { ...base, externalId: "/works/OL2W", title: "Words of Radiance",
      subtitle: "Brandon Sanderson" };
    const out = collapseByWikidata([a, b], [entity]);
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("/works/OL1W");
  });

  it("el fundido hereda altTitles de ambos", () => {
    const local: SearchResult = { ...base, externalId: "/works/OL1W", catalogId: "uuid-7",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson",
      altTitles: ["Palabras Radiantes", "PR alt"] };
    const api: SearchResult = { ...base, externalId: "/works/OL2W", title: "Words of Radiance",
      subtitle: "Brandon Sanderson", altTitles: ["Words of Radiance"] };
    const out = collapseByWikidata([local, api], [entity]);
    expect(out).toHaveLength(1);
    expect(out[0].catalogId).toBe("uuid-7");
    expect(new Set(out[0].altTitles)).toEqual(
      new Set(["Palabras Radiantes", "PR alt", "Words of Radiance"])
    );
  });
});
