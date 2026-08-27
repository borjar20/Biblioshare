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

  it("devuelve [] si la respuesta HTTP no es ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 500 }))
    );
    expect(await searchInventaireEntities("palabras radiantes")).toEqual([]);
  });

  it("devuelve [] si la respuesta trae JSON malformado", async () => {
    // El camino más frágil del contrato «nunca lanza»: `res.ok` es true pero
    // el cuerpo no parsea, y `res.json()` lanza dentro del try/catch.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no es json")));
    expect(await searchInventaireEntities("palabras radiantes")).toEqual([]);
  });

  it("descarta una entidad de obra sin labels", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ uri: "wd:Q8034469" }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q8034469": {} },
      })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchInventaireEntities("palabras radiantes")).toEqual([]);
  });

  it("descarta una entidad con labels vacío ({})", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ uri: "wd:Q8034469" }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q8034469": { labels: {} } },
      })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchInventaireEntities("palabras radiantes")).toEqual([]);
  });

  it("con inv: y wd: mezcladas en /api/search, descarta la inv: y conserva la wd:", async () => {
    const fetchMock = vi.fn()
      // /api/search devuelve una entidad inv: (propia de Inventaire, sin
      // equivalente en Wikidata) junto a la wd: que sí ancla identidad.
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [
          { uri: "inv:de41d4750b6a757d5d0b8102b51909a0" },
          { uri: "wd:Q8034469" },
        ],
      })))
      // by-uris solo debe pedirse para la wd:, así que solo esa aparece aquí.
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q8034469": { labels: { es: "Palabras radiantes" } } },
      })));
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchInventaireEntities("palabras radiantes");

    expect(out).toEqual([{
      uri: "wd:Q8034469",
      labels: { es: "Palabras radiantes" },
      authorNames: [],
    }]);
    const uriParam = new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("uris");
    expect(uriParam).not.toContain("inv:");
  });

  it("si el autor de wdt:P50 no aparece en la respuesta de autores, la entidad se devuelve sin esa entrada", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ uri: "wd:Q8034469" }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q8034469": {
          labels: { es: "Palabras radiantes" },
          claims: { "wdt:P50": ["wd:Q47217"] },
        } },
      })))
      // La ronda de autores no incluye wd:Q47217 (p.ej. Inventaire lo devolvió
      // vacío): la entidad no debe quedar descartada por eso.
      .mockResolvedValueOnce(new Response(JSON.stringify({ entities: {} })));
    vi.stubGlobal("fetch", fetchMock);

    const out = await searchInventaireEntities("palabras radiantes");

    expect(out).toEqual([{
      uri: "wd:Q8034469",
      labels: { es: "Palabras radiantes" },
      authorNames: [],
    }]);
  });
});
