import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const g = globalThis as unknown as { fetch: typeof fetch };

function mockTmdb(payload: unknown) {
  g.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as Response);
}

describe("getMovieForHydration", () => {
  const prev = process.env.TMDB_API_KEY;
  beforeEach(() => { process.env.TMDB_API_KEY = "test-token"; });
  afterEach(() => { process.env.TMDB_API_KEY = prev; vi.restoreAllMocks(); });

  it("mapea título, director (de credits), año, duración y géneros", async () => {
    mockTmdb({
      title: "El viaje de Chihiro",
      original_title: "千と千尋の神隠し",
      overview: "Una niña…",
      poster_path: "/p.jpg",
      release_date: "2001-07-20",
      runtime: 125,
      genres: [{ id: 16 }, { id: 10751 }],
      credits: { crew: [{ id: 1, name: "Hayao Miyazaki", job: "Director" }], cast: [] },
    });
    const { getMovieForHydration } = await import("./tmdb");
    const r = await getMovieForHydration(129);
    expect(r?.title).toBe("El viaje de Chihiro");
    expect(r?.director).toBe("Hayao Miyazaki");
    expect(r?.year).toBe(2001);
    expect(r?.durationMinutes).toBe(125);
    expect(r?.coverUrl).toContain("/p.jpg");
    expect(r?.genres).not.toBeNull();
  });

  it("sin traducción española, cae al título y la sinopsis en-US (no al original ilegible)", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const en = String(url).includes("language=en-US");
      return {
        ok: true,
        json: async () =>
          en
            ? { title: "Crush and Blush", overview: "Mi-sook, a teacher…" }
            : {
                // Lo que TMDB devuelve en es-ES cuando no hay traducción.
                title: "미쓰 홍당무",
                original_title: "미쓰 홍당무",
                overview: "",
                poster_path: null,
                credits: { crew: [], cast: [] },
              },
      } as Response;
    });
    g.fetch = fetchMock as unknown as typeof fetch;
    const { getMovieForHydration } = await import("./tmdb");
    const r = await getMovieForHydration(52415);
    expect(r?.title).toBe("Crush and Blush");
    expect(r?.originalTitle).toBe("미쓰 홍당무");
    expect(r?.synopsis).toBe("Mi-sook, a teacher…");
  });

  it("con título y sinopsis en español no hace la segunda llamada", async () => {
    mockTmdb({
      title: "El viaje de Chihiro", original_title: "千と千尋の神隠し", overview: "Una niña…",
      poster_path: null, credits: { crew: [], cast: [] },
    });
    const { getMovieForHydration } = await import("./tmdb");
    await getMovieForHydration(129);
    expect(g.fetch).toHaveBeenCalledTimes(1);
  });

  it("devuelve null si el token no está configurado", async () => {
    process.env.TMDB_API_KEY = "";
    const { getMovieForHydration } = await import("./tmdb");
    expect(await getMovieForHydration(1)).toBeNull();
  });
});

describe("getSeriesForHydration", () => {
  const prev = process.env.TMDB_API_KEY;
  beforeEach(() => { process.env.TMDB_API_KEY = "test-token"; });
  afterEach(() => { process.env.TMDB_API_KEY = prev; vi.restoreAllMocks(); });

  it("mapea creator (de created_by), temporadas, episodios y runtime", async () => {
    mockTmdb({
      name: "Breaking Bad",
      original_name: "Breaking Bad",
      overview: "Un profe…",
      poster_path: "/bb.jpg",
      first_air_date: "2008-01-20",
      number_of_seasons: 5,
      number_of_episodes: 62,
      episode_run_time: [47],
      created_by: [{ id: 66633, name: "Vince Gilligan", profile_path: null }],
      genres: [{ id: 18 }],
      credits: { crew: [], cast: [] },
    });
    const { getSeriesForHydration } = await import("./tmdb");
    const r = await getSeriesForHydration(1396);
    expect(r?.title).toBe("Breaking Bad");
    expect(r?.creator).toBe("Vince Gilligan");
    expect(r?.totalSeasons).toBe(5);
    expect(r?.totalEpisodes).toBe(62);
    expect(r?.episodeRuntimeMinutes).toBe(47);
  });
});
