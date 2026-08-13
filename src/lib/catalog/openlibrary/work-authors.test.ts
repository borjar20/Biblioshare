import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWorkAuthorKeys, fetchOpenLibraryAuthorByKey } from "./work-authors";

function mockJson(payload: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => payload });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWorkAuthorKeys", () => {
  it("devuelve las claves cortas en el orden del work", async () => {
    // /works/OL8479867W.json real: Rothfuss y el ilustrador Marc Simonetti,
    // los dos con type "/type/author_role". OL no distingue el rol; por eso
    // aquí no se filtra nada.
    vi.stubGlobal(
      "fetch",
      mockJson({
        authors: [
          { author: { key: "/authors/OL2830895A" }, type: { key: "/type/author_role" } },
          { type: { key: "/type/author_role" }, author: { key: "/authors/OL9118672A" } },
        ],
      })
    );

    expect(await fetchWorkAuthorKeys("/works/OL8479867W")).toEqual([
      "OL2830895A",
      "OL9118672A",
    ]);
  });

  it("tolera entradas rotas y claves repetidas", async () => {
    vi.stubGlobal(
      "fetch",
      mockJson({
        authors: [
          { author: { key: "/authors/OL79034A" } },
          { author: {} },
          {},
          { author: { key: "/authors/OL79034A" } },
        ],
      })
    );

    expect(await fetchWorkAuthorKeys("OL893414W")).toEqual(["OL79034A"]);
  });

  it("con la obra sin autores o la API caída devuelve lista vacía", async () => {
    vi.stubGlobal("fetch", mockJson({}));
    expect(await fetchWorkAuthorKeys("OL1W")).toEqual([]);

    vi.stubGlobal("fetch", mockJson({}, false));
    expect(await fetchWorkAuthorKeys("OL1W")).toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await fetchWorkAuthorKeys("OL1W")).toEqual([]);

    expect(await fetchWorkAuthorKeys("")).toEqual([]);
  });
});

describe("fetchOpenLibraryAuthorByKey", () => {
  it("mapea la ficha completa, con la foto por el CDN de autores", async () => {
    vi.stubGlobal(
      "fetch",
      mockJson({
        name: "H.P. Lovecraft",
        bio: { value: "  Escritor estadounidense.  " },
        photos: [-1, 6607781],
        birth_date: "20 August 1890",
        death_date: "15 March 1937",
      })
    );

    expect(await fetchOpenLibraryAuthorByKey("/authors/OL22161A")).toEqual({
      key: "OL22161A",
      name: "H.P. Lovecraft",
      aliases: [],
      bio: "Escritor estadounidense.",
      photoUrl: "https://covers.openlibrary.org/a/id/6607781-M.jpg",
      birthDate: "20 August 1890",
      deathDate: "15 March 1937",
    });
  });

  it("descarta al autor sin forma latina", async () => {
    vi.stubGlobal("fetch", mockJson({ name: "Френк Герберт" }));
    expect(await fetchOpenLibraryAuthorByKey("OL7388009A")).toBeNull();
  });

  it("con la API caída devuelve null", async () => {
    vi.stubGlobal("fetch", mockJson({}, false));
    expect(await fetchOpenLibraryAuthorByKey("OL22161A")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await fetchOpenLibraryAuthorByKey("OL22161A")).toBeNull();

    expect(await fetchOpenLibraryAuthorByKey("")).toBeNull();
  });
});
