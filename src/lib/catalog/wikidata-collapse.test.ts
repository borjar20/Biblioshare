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
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson", altTitles: ["Palabras Radiantes"], editionCount: 1 };
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
});
