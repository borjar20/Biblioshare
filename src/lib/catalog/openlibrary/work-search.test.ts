import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWorkByTitleAuthor } from "./work-search";

afterEach(() => {
  vi.unstubAllGlobals();
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
