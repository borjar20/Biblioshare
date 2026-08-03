import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchImportRow } from "./match-row";
import { searchLocalCatalog } from "@/lib/catalog/local-search";
import { getMovieAsSearchResult, searchMoviesForImport } from "@/lib/catalog/tmdb";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import type { ImportCandidate, ImportRow } from "./types";

// isSameTitle (title-match) queda SIN mockear a propósito: el test valida el
// matcher real. Solo se falsean las fuentes de candidatos.
vi.mock("@/lib/catalog/local-search", () => ({
  findLocalBookByIsbn: vi.fn(),
  searchLocalCatalog: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/catalog/tmdb", () => ({
  searchMoviesForImport: vi.fn().mockResolvedValue([]),
  getMovieAsSearchResult: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/catalog/find-or-create", () => ({
  findOrCreateCatalogItem: vi.fn().mockResolvedValue("created-id"),
}));

const localMock = vi.mocked(searchLocalCatalog);
const apiMock = vi.mocked(searchMoviesForImport);

const sr = (o: Partial<ImportCandidate>): ImportCandidate => ({
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

describe("matchMovie: los tres títulos de una película", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMock.mockResolvedValue([]);
    apiMock.mockResolvedValue([]);
  });

  it("empareja aunque el `title` es-ES difiera, usando `originalTitle`", async () => {
    // Exactamente lo que devuelve TMDB para esta película con language=es-ES.
    apiMock.mockResolvedValue([
      sr({
        externalId: "278",
        title: "Cadena perpetua",
        originalTitle: "The Shawshank Redemption",
        englishTitle: "The Shawshank Redemption",
        year: 1994,
      }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toEqual({ kind: "matched", catalogId: "created-id" });
    expect(findOrCreateCatalogItem).toHaveBeenCalledOnce();
  });

  it("empareja por el título en INGLÉS cuando ni el es-ES ni el original coinciden", async () => {
    // El caso que la PR #356 no cubría: Letterboxd exporta "Pan's Labyrinth",
    // que no es el title es-ES ni el original — ambos son el español.
    apiMock.mockResolvedValue([
      sr({
        externalId: "1417",
        title: "El laberinto del fauno",
        originalTitle: "El laberinto del fauno",
        englishTitle: "Pan's Labyrinth",
        year: 2006,
      }),
    ]);

    const result = await matchImportRow(
      client,
      "movie",
      movieRow({ title: "Pan's Labyrinth", year: 2006 })
    );

    expect(result).toEqual({ kind: "matched", catalogId: "created-id" });
  });

  it("empareja un título original en japonés por su título internacional", async () => {
    apiMock.mockResolvedValue([
      sr({
        externalId: "129",
        title: "El viaje de Chihiro",
        originalTitle: "千と千尋の神隠し",
        englishTitle: "Spirited Away",
        year: 2001,
      }),
    ]);

    const result = await matchImportRow(
      client,
      "movie",
      movieRow({ title: "Spirited Away", year: 2001 })
    );

    expect(result).toEqual({ kind: "matched", catalogId: "created-id" });
  });

  it("NO empareja cuando no coincide ninguno de los tres títulos ni hay nada de ese año", async () => {
    apiMock.mockResolvedValue([
      sr({ title: "Otra peli", originalTitle: "Some Other Film", year: 1970 }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toEqual({ kind: "unmatched" });
    expect(findOrCreateCatalogItem).not.toHaveBeenCalled();
  });

  it("empareja por `title` cuando `originalTitle` viene ausente (resultado del catálogo local)", async () => {
    localMock.mockResolvedValue([
      // Los resultados locales no traen originalTitle (undefined).
      sr({ title: "The Shawshank Redemption", year: 1994, catalogId: "local-1" }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toEqual({ kind: "matched", catalogId: "local-1" });
    // Ni siquiera se llega a TMDB si el local ya casa.
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("casa una fila cacheada por `originalTitle` cuando el `title` local es la traducción es-ES", async () => {
    localMock.mockResolvedValue([
      sr({
        title: "Cadena perpetua",
        originalTitle: "The Shawshank Redemption",
        year: 1994,
        catalogId: "local-42",
      }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toEqual({ kind: "matched", catalogId: "local-42" });
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("el chequeo de año sigue vetando un título que coincide pero es de otra obra", async () => {
    apiMock.mockResolvedValue([
      sr({
        title: "Cadena perpetua",
        originalTitle: "The Shawshank Redemption",
        englishTitle: "The Shawshank Redemption",
        year: 1970, // fuera de año±1 respecto al CSV (1994)
      }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toEqual({ kind: "unmatched" });
    expect(findOrCreateCatalogItem).not.toHaveBeenCalled();
  });
});

describe("matchMovie: desempate por el usuario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMock.mockResolvedValue([]);
    apiMock.mockResolvedValue([]);
  });

  it("no elige por su cuenta cuando dos obras casan por título Y año", async () => {
    // Caso real: "The Visit (2015)" son dos películas distintas en TMDB.
    apiMock.mockResolvedValue([
      sr({ externalId: "298312", title: "La visita", originalTitle: "The Visit", year: 2015 }),
      sr({ externalId: "769428", title: "The Visit", originalTitle: "The Visit", year: 2015 }),
    ]);

    const result = await matchImportRow(
      client,
      "movie",
      movieRow({ title: "The Visit", year: 2015 })
    );

    expect(result).toEqual({
      kind: "ambiguous",
      candidates: [
        expect.objectContaining({ externalId: "298312" }),
        expect.objectContaining({ externalId: "769428" }),
      ],
    });
    // Lo importante: NO se ha dado de alta nada todavía.
    expect(findOrCreateCatalogItem).not.toHaveBeenCalled();
  });

  it("ofrece los candidatos del año cuando ningún título casa (título alternativo)", async () => {
    apiMock.mockResolvedValue([
      sr({ externalId: "1", title: "Título que no casa", year: 1994 }),
      sr({ externalId: "2", title: "Tampoco este", year: 1930 }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result).toEqual({
      kind: "ambiguous",
      candidates: [expect.objectContaining({ externalId: "1" })],
    });
  });

  it("sin año en el CSV no se ofrece la lista floja: sería toda la búsqueda", async () => {
    apiMock.mockResolvedValue([
      sr({ externalId: "1", title: "Título que no casa", year: 1994 }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow({ year: null }));

    expect(result).toEqual({ kind: "unmatched" });
  });

  it("corta la lista de candidatos en 6", async () => {
    apiMock.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) =>
        sr({ externalId: String(i), title: "The Shawshank Redemption", year: 1994 })
      )
    );

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result.kind).toBe("ambiguous");
    expect(result.kind === "ambiguous" && result.candidates).toHaveLength(6);
  });

  it("una coincidencia EXACTA gana a una por contención difusa", async () => {
    // Caso real: buscar "Crouching Tiger, Hidden Dragon" devuelve también el
    // making-of, que pasa el filtro de contención de isSameTitle (y salía
    // ANTES en la lista, así que se lo llevaba). El exacto manda.
    apiMock.mockResolvedValue([
      sr({
        externalId: "1535928",
        title: "The Making of 'Crouching Tiger, Hidden Dragon'",
        englishTitle: "The Making of 'Crouching Tiger, Hidden Dragon'",
        year: 2000,
      }),
      sr({
        externalId: "146",
        title: "Tigre y dragón",
        englishTitle: "Crouching Tiger, Hidden Dragon",
        year: 2000,
      }),
    ]);

    const result = await matchImportRow(
      client,
      "movie",
      movieRow({ title: "Crouching Tiger, Hidden Dragon", year: 2000 })
    );

    expect(result).toEqual({ kind: "matched", catalogId: "created-id" });
    expect(findOrCreateCatalogItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ externalId: "146" }),
      undefined
    );
  });

  it("dos copias de la MISMA obra en el catálogo local también piden desempate", async () => {
    localMock.mockResolvedValue([
      sr({ title: "The Shawshank Redemption", year: 1994, catalogId: "local-1" }),
      sr({ title: "The Shawshank Redemption", year: 1995, catalogId: "local-2" }),
    ]);

    const result = await matchImportRow(client, "movie", movieRow());

    expect(result.kind).toBe("ambiguous");
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe("matchMovie: la ficha que se cachea va en español", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMock.mockResolvedValue([]);
    apiMock.mockResolvedValue([]);
  });

  it("rescata la ficha es-ES por id cuando el candidato solo salió en la búsqueda inglesa", async () => {
    // "Parasite": la búsqueda es-ES no la devuelve en la primera página (allí es
    // "Parásitos"), así que el candidato llega con el título inglés. Cachearlo
    // tal cual dejaría "Parasite" en un catálogo que dice "Parásitos".
    apiMock.mockResolvedValue([
      sr({
        externalId: "496243",
        title: "Parasite",
        originalTitle: "기생충",
        englishTitle: "Parasite",
        year: 2019,
        spanishMissing: true,
      }),
    ]);
    vi.mocked(getMovieAsSearchResult).mockResolvedValue(
      sr({ externalId: "496243", title: "Parásitos", originalTitle: "기생충", year: 2019 })
    );

    const result = await matchImportRow(
      client,
      "movie",
      movieRow({ title: "Parasite", year: 2019 })
    );

    expect(result).toEqual({ kind: "matched", catalogId: "created-id" });
    expect(getMovieAsSearchResult).toHaveBeenCalledWith(496243);
    expect(findOrCreateCatalogItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: "Parásitos" }),
      undefined
    );
  });

  it("no gasta la llamada extra cuando la búsqueda es-ES sí trajo la película", async () => {
    apiMock.mockResolvedValue([
      sr({
        externalId: "278",
        title: "Cadena perpetua",
        englishTitle: "The Shawshank Redemption",
        year: 1994,
      }),
    ]);

    await matchImportRow(client, "movie", movieRow());

    expect(getMovieAsSearchResult).not.toHaveBeenCalled();
  });
});
