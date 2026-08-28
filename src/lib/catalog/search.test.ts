import { describe, expect, it, vi, beforeEach } from "vitest";

// Solo la rama ISBN de `searchCatalog` (spec §1 y §4): local -> OpenLibrary ->
// Google Books de último recurso. La rama de búsqueda por texto (fusión con
// Inventaire/OL/local) ya tiene su propia cobertura indirecta en
// merge-results.test.ts / wikidata-collapse.test.ts y no se toca aquí.
const mocks = vi.hoisted(() => ({
  findLocalBookByIsbn: vi.fn(),
  searchLocalCatalog: vi.fn(),
  lookupIsbn: vi.fn(),
  findVolumeByIsbn: vi.fn(),
  searchWorks: vi.fn(),
  searchInventaireEntities: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("./local-search", () => ({
  findLocalBookByIsbn: mocks.findLocalBookByIsbn,
  searchLocalCatalog: mocks.searchLocalCatalog,
}));
vi.mock("./openlibrary/isbn-lookup", () => ({ lookupIsbn: mocks.lookupIsbn }));
vi.mock("./googlebooks/client", () => ({ findVolumeByIsbn: mocks.findVolumeByIsbn }));
vi.mock("./openlibrary/work-search", () => ({ searchWorks: mocks.searchWorks }));
vi.mock("./inventaire/client", () => ({
  searchInventaireEntities: mocks.searchInventaireEntities,
}));

import { searchCatalog } from "./search";

const ISBN = "9788410138407";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MOCK_EXTERNAL_APIS;
});

describe("searchCatalog - rama ISBN", () => {
  it("hit en catálogo local -> corta ahí, no llama a OL ni a GB", async () => {
    mocks.findLocalBookByIsbn.mockResolvedValue({
      itemType: "book",
      externalId: "/works/OL1W",
      title: "T",
      subtitle: null,
      coverUrl: null,
      year: null,
      synopsis: null,
      genres: null,
      matchedIsbn: ISBN,
    });

    const results = await searchCatalog("book", ISBN);

    expect(results).toHaveLength(1);
    expect(results[0].externalId).toBe("/works/OL1W");
    expect(mocks.lookupIsbn).not.toHaveBeenCalled();
    expect(mocks.findVolumeByIsbn).not.toHaveBeenCalled();
  });

  it("sin hit local, OpenLibrary lo conoce -> usa lookupIsbn, no llega a GB", async () => {
    mocks.findLocalBookByIsbn.mockResolvedValue(null);
    mocks.lookupIsbn.mockResolvedValue({
      itemType: "book",
      externalId: "/works/OL2W",
      title: "OL",
      subtitle: null,
      coverUrl: null,
      year: null,
      synopsis: null,
      genres: null,
      matchedIsbn: ISBN,
    });

    const results = await searchCatalog("book", ISBN);

    expect(results[0].externalId).toBe("/works/OL2W");
    expect(mocks.findVolumeByIsbn).not.toHaveBeenCalled();
  });

  it("ni local ni OL, GB sí -> nace GB-only sin work key", async () => {
    mocks.findLocalBookByIsbn.mockResolvedValue(null);
    mocks.lookupIsbn.mockResolvedValue(null);
    mocks.findVolumeByIsbn.mockResolvedValue({
      volumeId: "vol-1",
      title: "GB Title",
      authors: ["A", "B"],
      isbns: [ISBN],
      synopsis: "syn",
      coverUrl: "cover",
      pageCount: 300,
      language: "es",
    });

    const results = await searchCatalog("book", ISBN);

    expect(results).toEqual([
      {
        itemType: "book",
        externalId: "",
        googleVolumeId: "vol-1",
        title: "GB Title",
        subtitle: "A, B",
        coverUrl: "cover",
        year: null,
        synopsis: "syn",
        genres: null,
        matchedIsbn: ISBN,
      },
    ]);
  });

  it("GB-only con autores vacíos -> subtitle null, no cadena vacía", async () => {
    mocks.findLocalBookByIsbn.mockResolvedValue(null);
    mocks.lookupIsbn.mockResolvedValue(null);
    mocks.findVolumeByIsbn.mockResolvedValue({
      volumeId: "vol-2",
      title: "T",
      authors: [],
      isbns: [ISBN],
      synopsis: null,
      coverUrl: null,
      pageCount: null,
      language: null,
    });

    const results = await searchCatalog("book", ISBN);
    expect(results[0].subtitle).toBeNull();
  });

  it("GB no conoce el volumen -> []", async () => {
    mocks.findLocalBookByIsbn.mockResolvedValue(null);
    mocks.lookupIsbn.mockResolvedValue(null);
    mocks.findVolumeByIsbn.mockResolvedValue(null);

    expect(await searchCatalog("book", ISBN)).toEqual([]);
  });

  it("GB devuelve volumen sin título fiable -> [] (no basta con 'algo')", async () => {
    mocks.findLocalBookByIsbn.mockResolvedValue(null);
    mocks.lookupIsbn.mockResolvedValue(null);
    mocks.findVolumeByIsbn.mockResolvedValue({
      volumeId: "vol-3",
      title: null,
      authors: [],
      isbns: [ISBN],
      synopsis: null,
      coverUrl: null,
      pageCount: null,
      language: null,
    });

    expect(await searchCatalog("book", ISBN)).toEqual([]);
  });
});

describe("searchCatalog - rama texto", () => {
  // Invariante crítica (spec §4): Google Books NUNCA nace obra desde una
  // búsqueda por TEXTO, solo desde un ISBN exacto (rama de arriba). Si alguien
  // añade esa llamada a la rama de texto, este test debe fallar solo.
  it("búsqueda por texto no llama a findVolumeByIsbn ni produce resultados con googleVolumeId", async () => {
    mocks.searchLocalCatalog.mockResolvedValue([]);
    mocks.searchWorks.mockResolvedValue([]);
    mocks.searchInventaireEntities.mockResolvedValue([]);

    const results = await searchCatalog("book", "dune");

    expect(mocks.findVolumeByIsbn).not.toHaveBeenCalled();
    expect(results.every((r) => !("googleVolumeId" in r))).toBe(true);
  });
});
