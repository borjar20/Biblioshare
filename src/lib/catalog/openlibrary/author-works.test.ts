import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthorWorks } from "./author-works";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockOk(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

describe("getAuthorWorks", () => {
  it("mapea entries a workKey/title/coverUrl", async () => {
    mockOk({
      entries: [
        { key: "/works/OL1W", title: "Fundación", covers: [111] },
        { key: "/works/OL2W", title: "Yo, robot", covers: [] },
      ],
    });

    const works = await getAuthorWorks("OL34221A");

    expect(works).toEqual([
      {
        workKey: "/works/OL1W",
        title: "Fundación",
        coverUrl: "https://covers.openlibrary.org/b/id/111-L.jpg",
      },
      { workKey: "/works/OL2W", title: "Yo, robot", coverUrl: null },
    ]);
  });

  it("normaliza la clave del autor: acepta 'OL1A' y '/authors/OL1A'", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await getAuthorWorks("/authors/OL1A");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/authors/OL1A/works.json");
  });

  it("descarta entradas sin title o sin key", async () => {
    mockOk({
      entries: [
        { key: "/works/OL1W", title: "" },
        { title: "Sin clave" },
        { key: "/works/OL3W", title: "Buena" },
      ],
    });

    const works = await getAuthorWorks("OL1A");

    expect(works.map((w) => w.workKey)).toEqual(["/works/OL3W"]);
  });

  it("descarta covers negativos (OL usa -1 para 'no hay portada')", async () => {
    mockOk({ entries: [{ key: "/works/OL1W", title: "T", covers: [-1, 222] }] });

    const works = await getAuthorWorks("OL1A");

    expect(works[0].coverUrl).toBe("https://covers.openlibrary.org/b/id/222-L.jpg");
  });

  it("deduplica el mismo workKey repetido", async () => {
    mockOk({
      entries: [
        { key: "/works/OL1W", title: "T" },
        { key: "/works/OL1W", title: "T otra vez" },
      ],
    });

    expect(await getAuthorWorks("OL1A")).toHaveLength(1);
  });

  it("respuesta no ok -> []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await getAuthorWorks("OL1A")).toEqual([]);
  });

  it("fetch que lanza -> [] (nunca propaga)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("red caída")));
    expect(await getAuthorWorks("OL1A")).toEqual([]);
  });

  it("clave vacía -> [] sin llamar a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getAuthorWorks("")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
