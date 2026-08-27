import { describe, expect, it, vi, afterEach } from "vitest";
import { qidFromUri, searchInventaireEntities } from "./client";

afterEach(() => vi.restoreAllMocks());

describe("qidFromUri", () => {
  it("extrae QID de uri wd:", () => expect(qidFromUri("wd:Q8034469")).toBe("Q8034469"));
  it("rechaza entidades inv: (no son identidad Wikidata)", () =>
    expect(qidFromUri("inv:de41d4750b6a757d5d0b8102b51909a0")).toBeNull());
});

describe("searchInventaireEntities", () => {
  it("devuelve [] si la API falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await searchInventaireEntities("palabras radiantes")).toEqual([]);
  });
  it("resuelve labels y autores de las entidades wd:", async () => {
    const fetchMock = vi.fn()
      // 1ª llamada: /api/search
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ uri: "wd:Q8034469", label: "Palabras radiantes" }],
      })))
      // 2ª: by-uris de las obras (labels + P50)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q8034469": {
          labels: { es: "Palabras radiantes", en: "Words of Radiance" },
          claims: { "wdt:P50": ["wd:Q47217"] },
        } },
      })))
      // 3ª: by-uris de los autores
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q47217": { labels: { en: "Brandon Sanderson" } } },
      })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await searchInventaireEntities("palabras radiantes");
    expect(out).toEqual([{
      uri: "wd:Q8034469",
      labels: { es: "Palabras radiantes", en: "Words of Radiance" },
      authorNames: ["Brandon Sanderson"],
    }]);
  });
});
