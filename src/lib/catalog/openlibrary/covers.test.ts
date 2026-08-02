import { afterEach, describe, expect, it, vi } from "vitest";
import { mapWorkCovers } from "./covers";
import { fetchWorkCovers } from "./work-detail";

describe("mapWorkCovers", () => {
  it("mapea cada cover id a una URL de tamaño L", () => {
    expect(mapWorkCovers([123, 456])).toEqual([
      "https://covers.openlibrary.org/b/id/123-L.jpg",
      "https://covers.openlibrary.org/b/id/456-L.jpg",
    ]);
  });

  it("filtra ids no positivos (OpenLibrary usa -1 como 'sin portada')", () => {
    expect(mapWorkCovers([-1, 0, 789])).toEqual([
      "https://covers.openlibrary.org/b/id/789-L.jpg",
    ]);
  });

  it("undefined/null -> []", () => {
    expect(mapWorkCovers(undefined)).toEqual([]);
    expect(mapWorkCovers(null)).toEqual([]);
  });
});

describe("fetchWorkCovers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("res.ok === false -> []", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );

    const urls = await fetchWorkCovers("OL893415W");

    expect(urls).toEqual([]);
  });

  it("fetch lanza (timeout/red) -> []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const urls = await fetchWorkCovers("OL893415W");

    expect(urls).toEqual([]);
  });

  it("res.ok === true -> mapea covers a URLs de tamaño L, descartando ids no positivos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ covers: [123, -1] }),
      })
    );

    const urls = await fetchWorkCovers("OL893415W");

    expect(urls).toEqual(["https://covers.openlibrary.org/b/id/123-L.jpg"]);
  });

  it("clave vacía -> [] sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const urls = await fetchWorkCovers("");

    expect(urls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
