import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDITIONS_PAGE_SIZE,
  fetchLiveWorkEditions,
  fetchRepresentationCandidates,
  fetchWorkEditions,
  resolveWorkKey,
} from "./editions";
import {
  fetchFirstEditionDescription,
  fetchWork,
  fetchWorkCovers,
  normalizeWorkKey,
} from "./work-detail";
import { lookupIsbn } from "./isbn-lookup";

afterEach(() => vi.unstubAllGlobals());

// Cada caso llega a la función pública real. El spy es la frontera de red:
// no basta con que la URL mantenga openlibrary.org si cambia el endpoint.
const INVALID_IDENTIFIERS = [
  "../search.json?q=proof#",
  "/works/../search.json?q=proof#",
  "works/../search.json?q=proof#",
  "OL45804W/../../search.json?q=proof#",
  "OL45804W?limit=1",
  "OL45804W#fragment",
  "OL45804W.json",
  "OL45804W/editions.json",
  "OL45804W\\..\\..\\search.json",
  "..\\search.json?q=proof#",
  "%2e%2e%2fsearch.json%3fq=proof%23",
  "%252e%252e%252fsearch.json",
  "OL45804W%2f..%2fsearch.json",
  "OL45804W%3fq=proof",
  "OL45804W%23fragment",
  "https://openlibrary.org/works/OL45804W",
  "https://example.com/OL45804W",
  "//example.com/OL45804W",
  "/works//OL45804W",
  "//OL45804W",
  "OL45804W/",
  "OL45804A",
  "OL45804M",
  "OLtestW",
  "OL45804W\n",
  "OL45804W\r",
  "OL45804W\u0000",
  "",
];

const WORK_FORMS = ["OL45804W", "works/OL45804W", "/works/OL45804W", "/OL45804W"];
const INVALID_RUNTIME_VALUES = [undefined, null, 45804, {}, ["OL45804W"]];

const workFetchers = [
  { name: "fetchWork", run: fetchWork, empty: null },
  { name: "fetchFirstEditionDescription", run: fetchFirstEditionDescription, empty: null },
  { name: "fetchWorkCovers", run: fetchWorkCovers, empty: [] },
  { name: "fetchWorkEditions", run: fetchWorkEditions, empty: [] },
  { name: "fetchLiveWorkEditions", run: (key: string) => fetchLiveWorkEditions(key, 20), empty: [] },
  {
    name: "fetchRepresentationCandidates",
    run: fetchRepresentationCandidates,
    empty: { es: null, en: null, pagesMedian: null },
  },
];

describe("OpenLibrary · identificadores no pueden cambiar el endpoint (#1292)", () => {
  for (const { name, run, empty } of workFetchers) {
    it(`${name}: rechaza rutas, query, fragmentos y escapes antes de fetch`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      vi.stubGlobal("fetch", fetchMock);
      for (const key of INVALID_IDENTIFIERS) {
        expect(await run(key), JSON.stringify(key)).toEqual(empty);
        expect(fetchMock, JSON.stringify(key)).not.toHaveBeenCalled();
      }
      for (const value of INVALID_RUNTIME_VALUES) {
        expect(await run(value as never)).toEqual(empty);
        expect(fetchMock).not.toHaveBeenCalled();
      }
    });
  }

  it("resolveWorkKey: rechaza los mismos ataques y ISBN inválidos antes de fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    for (const isbn of [...INVALID_IDENTIFIERS, ...INVALID_RUNTIME_VALUES, "9780140328722", "0975229800", "9780140328721\n?q=proof"]) {
      expect(await resolveWorkKey(isbn as never), JSON.stringify(isbn)).toBeNull();
      expect(fetchMock, JSON.stringify(isbn)).not.toHaveBeenCalled();
    }
  });

  it("lookupIsbn: rechaza rutas manipuladas e ISBN inválidos antes de fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    for (const isbn of [...INVALID_IDENTIFIERS, ...INVALID_RUNTIME_VALUES, "9780140328722", "0975229800"]) {
      expect(await lookupIsbn(isbn as never), JSON.stringify(isbn)).toBeNull();
      expect(fetchMock, JSON.stringify(isbn)).not.toHaveBeenCalled();
    }
  });

  for (const key of WORK_FORMS) {
    it(`fetchWork: ${key} conserva endpoint, caché y contenido canónico`, async () => {
      expect(normalizeWorkKey(key)).toBe("OL45804W");
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ title: "Fantastic Mr. Fox", description: { value: "Sinopsis canónica" } }),
      });
      vi.stubGlobal("fetch", fetchMock);
      expect(await fetchWork(key)).toMatchObject({ title: "Fantastic Mr. Fox", description: "Sinopsis canónica" });
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://openlibrary.org/works/OL45804W.json", {
        next: { revalidate: 86400 }, signal: expect.any(AbortSignal),
      });
    });

    it(`fetchFirstEditionDescription: ${key} conserva límite y primera sinopsis no vacía`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ entries: [{ description: "  " }, { description: { value: "Sinopsis de edición" } }] }),
      });
      vi.stubGlobal("fetch", fetchMock);
      expect(await fetchFirstEditionDescription(key)).toBe("Sinopsis de edición");
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://openlibrary.org/works/OL45804W/editions.json?limit=20", {
        next: { revalidate: 86400 }, signal: expect.any(AbortSignal),
      });
    });

    it(`fetchWorkCovers: ${key} conserva portadas y caché`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ covers: [42] }) });
      vi.stubGlobal("fetch", fetchMock);
      expect(await fetchWorkCovers(key)).toEqual(["https://covers.openlibrary.org/b/id/42-L.jpg"]);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://openlibrary.org/works/OL45804W.json", {
        next: { revalidate: 86400 }, signal: expect.any(AbortSignal),
      });
    });
  }

  for (const { name, run, pages } of [
    { name: "fetchWorkEditions", run: fetchWorkEditions, pages: 5 },
    { name: "fetchLiveWorkEditions", run: (key: string) => fetchLiveWorkEditions(key, 20), pages: 2 },
    { name: "fetchRepresentationCandidates", run: fetchRepresentationCandidates, pages: 2 },
  ]) {
    for (const key of WORK_FORMS) {
      it(`${name}: ${key} conserva paginación y tolera una página fallida`, async () => {
        const fetchMock = vi.fn(async (input: string) => {
          const offset = new URL(input).searchParams.get("offset");
          return { ok: offset !== "100", json: async () => ({ entries: [], size: 1000 }) };
        });
        vi.stubGlobal("fetch", fetchMock);
        await run(key);
        expect(fetchMock).toHaveBeenCalledTimes(pages);
        for (let index = 0; index < pages; index++) {
          expect(fetchMock).toHaveBeenNthCalledWith(index + 1,
            `https://openlibrary.org/works/OL45804W/editions.json?limit=${EDITIONS_PAGE_SIZE}&offset=${index * EDITIONS_PAGE_SIZE}`,
            { signal: expect.any(AbortSignal) });
        }
      });
    }
  }

  for (const [input, normalized] of [
    ["9780140328721", "9780140328721"],
    ["978-0-14-032872-1", "9780140328721"],
    ["097522980X", "097522980X"],
    ["0-9752298-0-x", "097522980X"],
  ]) {
    it(`resolveWorkKey: ISBN válido ${input} usa el endpoint ISBN y devuelve la obra`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true, json: async () => ({ works: [{ key: "/works/OL45804W" }] }),
      });
      vi.stubGlobal("fetch", fetchMock);
      expect(await resolveWorkKey(input)).toBe("/works/OL45804W");
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`https://openlibrary.org/isbn/${normalized}.json`, {
        signal: expect.any(AbortSignal),
      });
      // fetch mantiene su política por defecto: el proveedor documenta la
      // redirección ISBN -> edición, por lo que no se bloquea aquí.
      expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("redirect", "error");
    });
  }

  it("resolveWorkKey no devuelve una work key manipulada por el proveedor", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const key of [...INVALID_IDENTIFIERS, ...INVALID_RUNTIME_VALUES]) {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ works: [{ key }] }) });
      expect(await resolveWorkKey("9780140328721"), JSON.stringify(key)).toBeNull();
    }
  });

  it("resolveWorkKey normaliza las formas legítimas y la variante histórica con barra", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const key of WORK_FORMS) {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ works: [{ key }] }) });
      expect(await resolveWorkKey("9780140328721")).toBe("/works/OL45804W");
    }
  });

  it("lookupIsbn rechaza una work key inválida sin pedir una obra ni /works/.json", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const key of [...INVALID_IDENTIFIERS, ...INVALID_RUNTIME_VALUES]) {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ title: "Edición", works: [{ key }] }) });
      expect(await lookupIsbn("9780140328721"), JSON.stringify(key)).toBeNull();
      expect(fetchMock, JSON.stringify(key)).toHaveBeenCalledExactlyOnceWith("https://openlibrary.org/isbn/9780140328721.json", {
        next: { revalidate: 3600 }, signal: expect.any(AbortSignal),
      });
    }
  });

  for (const key of WORK_FORMS) {
    it(`lookupIsbn: ISBN y work key ${key} normalizados, con fallback de edición`, async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ title: "Fantastic Mr. Fox", works: [{ key }] }) })
        .mockResolvedValueOnce({ ok: false });
      vi.stubGlobal("fetch", fetchMock);
      expect(await lookupIsbn("978-0-14-032872-1")).toMatchObject({
        externalId: "/works/OL45804W", title: "Fantastic Mr. Fox", matchedIsbn: "9780140328721",
      });
      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://openlibrary.org/isbn/9780140328721.json", {
        next: { revalidate: 3600 }, signal: expect.any(AbortSignal),
      });
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://openlibrary.org/works/OL45804W.json", {
        next: { revalidate: 86400 }, signal: expect.any(AbortSignal),
      });
    });
  }
});
