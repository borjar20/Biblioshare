import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchImportRow } from "./match-row";
import { searchLocalCatalog } from "@/lib/catalog/local-search";
import { searchMovies } from "@/lib/catalog/tmdb";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import type { SearchResult } from "@/lib/catalog/types";
import type { ImportRow } from "./types";

// isSameTitle (title-match) queda SIN mockear a propósito: el test valida el
// matcher real. Solo se falsean las fuentes de candidatos.
vi.mock("@/lib/catalog/local-search", () => ({
  findLocalBookByIsbn: vi.fn(),
  searchLocalCatalog: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/catalog/tmdb", () => ({ searchMovies: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/catalog/find-or-create", () => ({
  findOrCreateCatalogItem: vi.fn().mockResolvedValue("created-id"),
}));

const localMock = vi.mocked(searchLocalCatalog);
const apiMock = vi.mocked(searchMovies);

const sr = (o: Partial<SearchResult>): SearchResult => ({
  itemType: "movie",
  externalId: "x",
  title: "",
  subtitle: null,
  coverUrl: null,
  year: null,
  synopsis: null,
  genres: null,
  ...o,
});

const movieRow = (over: Partial<ImportRow> = {}): ImportRow => ({
  rowNumber: 1,
  title: "The Shawshank Redemption",
  author: null,
  isbn: null,
  publisher: null,
  pageCount: null,
  year: 1994,
  status: "completed",
  rating: null,
  bookFormat: null,
  diaryDates: [],
  unknownStatusLabel: null,
  ...over,
});

const client = {} as never;

describe("matchMovie: título original de TMDB vs título traducido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMock.mockResolvedValue([]);
    apiMock.mockResolvedValue([]);
  });

  it("empareja aunque el `title` es-ES difiera, usando `originalTitle` (el que exporta Letterboxd)", async () => {
    // Exactamente lo que devuelve TMDB para esta película con language=es-ES.
    apiMock.mockResolvedValue([
      sr({
        externalId: "278",
        title: "Cadena perpetua",
        originalTitle: "The Shawshank Redemption",
        year: 1994,
      }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toBe("created-id");
    expect(findOrCreateCatalogItem).toHaveBeenCalledOnce();
  });

  it("NO empareja cuando ni `title` ni `originalTitle` coinciden", async () => {
    apiMock.mockResolvedValue([
      sr({ title: "Otra peli", originalTitle: "Some Other Film", year: 1994 }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toBeNull();
    expect(findOrCreateCatalogItem).not.toHaveBeenCalled();
  });

  it("empareja por `title` cuando `originalTitle` viene ausente (resultado del catálogo local)", async () => {
    localMock.mockResolvedValue([
      // Los resultados locales no traen originalTitle (undefined).
      sr({ title: "The Shawshank Redemption", year: 1994, catalogId: "local-1" }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toBe("local-1");
    // Ni siquiera se llega a TMDB si el local ya casa.
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("casa una fila cacheada por `originalTitle` cuando el `title` local es la traducción es-ES", async () => {
    // Tras el backfill, movies.original_title guarda el título original; el
    // title sigue siendo la traducción. Un CSV con el título original debe
    // resolver en local sin tocar TMDB.
    localMock.mockResolvedValue([
      sr({
        title: "Cadena perpetua",
        originalTitle: "The Shawshank Redemption",
        year: 1994,
        catalogId: "local-42",
      }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toBe("local-42");
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("el chequeo de año sigue vetando un título que coincide pero es de otra obra", async () => {
    apiMock.mockResolvedValue([
      sr({
        title: "Cadena perpetua",
        originalTitle: "The Shawshank Redemption",
        year: 1970, // fuera de año±1 respecto al CSV (1994)
      }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toBeNull();
    expect(findOrCreateCatalogItem).not.toHaveBeenCalled();
  });
});
