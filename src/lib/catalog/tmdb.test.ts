import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPosterPaths, mapPosterPaths } from "./tmdb";

describe("mapPosterPaths", () => {
  it("convierte file_path en URL absoluta con base w342", () => {
    const urls = mapPosterPaths({
      posters: [{ file_path: "/aaa.jpg" }, { file_path: "/bbb.jpg" }],
    });
    expect(urls).toEqual([
      "https://image.tmdb.org/t/p/w342/aaa.jpg",
      "https://image.tmdb.org/t/p/w342/bbb.jpg",
    ]);
  });

  it("descarta file_path nulo/vacío", () => {
    const urls = mapPosterPaths({
      posters: [{ file_path: null }, { file_path: "" }, { file_path: "/ok.jpg" }],
    });
    expect(urls).toEqual(["https://image.tmdb.org/t/p/w342/ok.jpg"]);
  });

  it("respuesta null o sin posters -> []", () => {
    expect(mapPosterPaths(null)).toEqual([]);
    expect(mapPosterPaths({})).toEqual([]);
  });
});

describe("getPosterPaths", () => {
  const originalApiKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    delete process.env.TMDB_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.TMDB_API_KEY;
    } else {
      process.env.TMDB_API_KEY = originalApiKey;
    }
    vi.unstubAllGlobals();
  });

  it("sin TMDB_API_KEY -> [] sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const urls = await getPosterPaths("movie", 123);

    expect(urls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("res.ok === false -> []", async () => {
    process.env.TMDB_API_KEY = "dummy-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );

    const urls = await getPosterPaths("movie", 123);

    expect(urls).toEqual([]);
  });

  it("res.ok === true -> mapea file_path a URL absoluta y descarta nulos", async () => {
    process.env.TMDB_API_KEY = "dummy-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          posters: [{ file_path: "/a.jpg" }, { file_path: null }],
        }),
      })
    );

    const urls = await getPosterPaths("movie", 123);

    expect(urls).toEqual(["https://image.tmdb.org/t/p/w342/a.jpg"]);
  });
});
