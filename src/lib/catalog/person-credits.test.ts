import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonCombinedCredits } from "./tmdb";

const originalApiKey = process.env.TMDB_API_KEY;

function mockResponse(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

beforeEach(() => {
  process.env.TMDB_API_KEY = "dummy-key";
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = originalApiKey;
  vi.unstubAllGlobals();
});

describe("getPersonCombinedCredits", () => {
  it("mapea cast de película y de serie, con personaje y portada absoluta", async () => {
    mockResponse({
      cast: [
        {
          id: 1,
          media_type: "movie",
          title: "Duna",
          original_title: "Dune",
          poster_path: "/duna.jpg",
          release_date: "2021-09-15",
          overview: "Arena.",
          genre_ids: [878],
          character: "Paul Atreides",
          vote_average: 7.8,
        },
        {
          id: 2,
          media_type: "tv",
          name: "Serie",
          original_name: "Series",
          poster_path: null,
          first_air_date: "2019-01-01",
          character: "Alguien",
          vote_average: 6,
        },
      ],
      crew: [],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(2);
    expect(credits[0]).toMatchObject({
      itemType: "movie",
      tmdbId: 1,
      title: "Duna",
      originalTitle: "Dune",
      coverUrl: "https://image.tmdb.org/t/p/w342/duna.jpg",
      year: 2021,
      role: "cast",
      character: "Paul Atreides",
      voteAverage: 7.8,
    });
    expect(credits[1]).toMatchObject({
      itemType: "series",
      tmdbId: 2,
      title: "Serie",
      coverUrl: null,
      year: 2019,
      role: "cast",
    });
  });

  it("del equipo solo conserva los job mapeables; descarta el resto", async () => {
    mockResponse({
      cast: [],
      crew: [
        { id: 10, media_type: "movie", title: "A", job: "Director", poster_path: null },
        { id: 11, media_type: "movie", title: "B", job: "Producer", poster_path: null },
        { id: 12, media_type: "movie", title: "C", job: "Screenplay", poster_path: null },
        { id: 13, media_type: "movie", title: "D", job: "Director of Photography", poster_path: null },
      ],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits.map((c) => [c.tmdbId, c.role])).toEqual([
      [10, "director"],
      [12, "writer"],
    ]);
  });

  it("un mismo ítem con dos roles produce DOS entradas", async () => {
    mockResponse({
      cast: [{ id: 7, media_type: "movie", title: "Doble", poster_path: null, character: "Él" }],
      crew: [{ id: 7, media_type: "movie", title: "Doble", poster_path: null, job: "Director" }],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(2);
    expect(credits.map((c) => c.role).sort()).toEqual(["cast", "director"]);
  });

  it("el MISMO par (ítem, rol) repetido se deduplica", async () => {
    mockResponse({
      cast: [],
      crew: [
        { id: 9, media_type: "movie", title: "X", poster_path: null, job: "Writer" },
        { id: 9, media_type: "movie", title: "X", poster_path: null, job: "Story" },
      ],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(1);
    expect(credits[0].role).toBe("writer");
  });

  it("descarta media_type que no sea movie/tv, y entradas sin título", async () => {
    mockResponse({
      cast: [
        { id: 1, media_type: "person", name: "No", poster_path: null },
        { id: 2, media_type: "movie", title: "", poster_path: null },
        { id: 3, media_type: "movie", title: "Sí", poster_path: null },
      ],
      crew: [],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits.map((c) => c.tmdbId)).toEqual([3]);
  });

  it("CONSERVA las obras sin póster y sin fecha", async () => {
    mockResponse({
      cast: [{ id: 4, media_type: "movie", title: "Perdida", poster_path: null }],
      crew: [],
    });

    const credits = await getPersonCombinedCredits(500);

    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ coverUrl: null, year: null });
  });

  it("sin TMDB_API_KEY -> [] sin llamar a fetch", async () => {
    delete process.env.TMDB_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getPersonCombinedCredits(500)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respuesta no ok -> []", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await getPersonCombinedCredits(500)).toEqual([]);
  });
});
