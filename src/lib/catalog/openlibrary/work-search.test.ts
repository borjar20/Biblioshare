import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWorkByTitleAuthor, searchWorks } from "./work-search";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(byLang: Record<string, unknown[]>) {
  return vi.fn().mockImplementation((url: URL | string) => {
    const lang = new URL(String(url)).searchParams.get("lang") ?? "";
    return Promise.resolve({ ok: true, json: async () => ({ docs: byLang[lang] ?? [] }) });
  });
}

describe("searchWorks", () => {
  it("hace DOS pasadas, es e inglés, con 40 y sin sort", async () => {
    const fetchMock = respondWith({ es: [], en: [] });
    vi.stubGlobal("fetch", fetchMock);

    await searchWorks("dune");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("lang=es"))).toBe(true);
    expect(urls.some((u) => u.includes("lang=en"))).toBe(true);
    for (const url of urls) {
      expect(url).toContain("limit=40");
      expect(url).toContain("editions.title");
      expect(url).toContain("language");
      expect(url).not.toContain("sort=");
    }
  });

  it("con una sola pasada vacía devuelve lo normalizado de la otra", async () => {
    // Divergencia deliberada con la bibliografía: allí media respuesta se
    // ESCRIBE y quedaría congelada, aquí no se escribe nada, así que media
    // respuesta es mejor que ninguna.
    vi.stubGlobal(
      "fetch",
      respondWith({
        es: [],
        en: [{ key: "/works/OL893415W", title: "Dune", language: ["eng"], edition_count: 312 }],
      })
    );

    const results = await searchWorks("dune");

    expect(results).toHaveLength(1);
    expect(results[0].externalId).toBe("/works/OL893415W");
  });

  it("si UNA pasada falla, devuelve lo que trajo la otra", async () => {
    // `Promise.all` cortaba a la primera que falla: un timeout del idioma
    // español vaciaba una búsqueda que la inglesa ya había contestado.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: URL | string) => {
        const lang = new URL(String(url)).searchParams.get("lang") ?? "";
        if (lang === "es") return Promise.reject(new Error("timeout"));
        return Promise.resolve({
          ok: true,
          json: async () => ({
            docs: [
              { key: "/works/OL893415W", title: "Dune", language: ["eng"], edition_count: 312 },
            ],
          }),
        });
      })
    );

    const results = await searchWorks("dune");

    expect(results.map((r) => r.externalId)).toEqual(["/works/OL893415W"]);
  });

  it("con las DOS pasadas caídas, o la consulta vacía, devuelve [] sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(searchWorks("dune")).resolves.toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(searchWorks("dune")).resolves.toEqual([]);

    const fetchMock = respondWith({ es: [], en: [] });
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchWorks("   ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveWorkByTitleAuthor", () => {
  it("devuelve la obra y sus claves de autor del primer resultado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL893414W",
              title: "Dune",
              author_name: ["Frank Herbert"],
              author_key: ["OL79034A"],
            },
          ],
        }),
      })
    );

    expect(await resolveWorkByTitleAuthor("Dune", "Frank Herbert")).toEqual({
      workKey: "/works/OL893414W",
      authorKeys: ["OL79034A"],
      titleMatches: true,
    });
  });

  it("pide el título y el autor por separado, no en una sola cadena", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await resolveWorkByTitleAuthor("Dune", "Frank Herbert");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("title=Dune");
    expect(url).toContain("author=Frank+Herbert");
    expect(url).toContain("author_key");
  });

  it("sin resultados, sin título, o con la API caída devuelve null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }));
    expect(await resolveWorkByTitleAuthor("Nada de nada", null)).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await resolveWorkByTitleAuthor("Dune", null)).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await resolveWorkByTitleAuthor("Dune", null)).toBeNull();

    expect(await resolveWorkByTitleAuthor("   ", null)).toBeNull();
  });

  it("descarta un doc sin key aunque venga primero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [{ title: "Dune" }, { key: "/works/OL893414W", title: "Dune", author_key: [] }],
        }),
      })
    );

    expect(await resolveWorkByTitleAuthor("Dune", null)).toEqual({
      workKey: "/works/OL893414W",
      authorKeys: [],
      titleMatches: true,
    });
  });

  it("titleMatches: true cuando el título coincide salvo mayúsculas, acentos o puntuación", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [{ key: "/works/OL1W", title: "¡El Aleph!", author_key: [] }],
        }),
      })
    );

    expect(await resolveWorkByTitleAuthor("el aleph", null)).toMatchObject({ titleMatches: true });
  });

  it("titleMatches: false cuando el resultado es otra obra distinta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [{ key: "/works/OL2W", title: "Fundación e Imperio", author_key: [] }],
        }),
      })
    );

    expect(await resolveWorkByTitleAuthor("Fundación", null)).toMatchObject({
      titleMatches: false,
    });
  });

  it("titleMatches: false cuando el doc no trae título", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          docs: [{ key: "/works/OL3W", author_key: [] }],
        }),
      })
    );

    expect(await resolveWorkByTitleAuthor("Dune", null)).toMatchObject({ titleMatches: false });
  });
});
