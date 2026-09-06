import { describe, expect, it, vi, afterEach } from "vitest";
import { qidFromUri, searchInventaireEntities, searchInventaireEntitiesOrNull } from "./client";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("qidFromUri", () => {
  it("extrae QID de uri wd:", () => expect(qidFromUri("wd:Q8034469")).toBe("Q8034469"));
  it("rechaza entidades inv: (no son identidad Wikidata)", () =>
    expect(qidFromUri("inv:de41d4750b6a757d5d0b8102b51909a0")).toBeNull());
});

describe("searchInventaireEntities", () => {
  it.each(["search", "works", "authors"])("no da por completa una respuesta inválida de %s", async (stage) => {
    const responses = [
      { results: [{ uri: "wd:Q1" }] },
      { entities: { "wd:Q1": { labels: { en: "Dune" }, claims: { "wdt:P50": ["wd:Q2"] } } } },
      { entities: {} },
    ];
    responses[["search", "works", "authors"].indexOf(stage)] = {} as typeof responses[number];
    const fetchMock = vi.fn();
    for (const body of responses) fetchMock.mockResolvedValueOnce(Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchInventaireEntitiesOrNull("Dune")).toBeNull();
  });
  it.each([429, 503])("conserva la búsqueda blanda ante HTTP %s y registra el estado sin la consulta", async (status) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchInventaireEntities("consulta privada")).toEqual([]);
    expect(warn).toHaveBeenCalledWith("Inventaire HTTP failure", { status, path: "/api/search" });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("consulta privada");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("un timeout y un JSON roto son fallos, no ausencias", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    expect(await searchInventaireEntitiesOrNull("Dune")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{")));
    expect(await searchInventaireEntitiesOrNull("Dune")).toBeNull();
  });
  it("distingue un bloqueo HTTP de una búsqueda completada sin resultados", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    expect(await searchInventaireEntitiesOrNull("Dune")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ results: [] })));
    expect(await searchInventaireEntitiesOrNull("Dune")).toEqual([]);
  });
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
    // El cuerpo del 500 trae datos VÁLIDOS a propósito, y el segundo mock
    // resolvería la entidad. Si la implementación dejara de mirar `res.ok`,
    // seguiría adelante y devolvería esa entidad en vez de []. Con un cuerpo
    // vacío el test pasaba igual sin la comprobación: no distinguía nada.
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ results: [{ uri: "wd:Q8034469" }] }), { status: 500 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              entities: { "wd:Q8034469": { labels: { es: "Palabras radiantes" } } },
            })
          )
        )
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
