import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPosterPaths, getSeriesEpisodes, mapPosterPaths } from "./tmdb";

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

// Issue #676: `totalSeasons` venía de una columna que cualquier `authenticated`
// podía escribir, y se convertía 1:1 en peticiones lanzadas de golpe. Estos
// tests fijan las dos propiedades que impiden la amplificación; sin ellos, un
// `Promise.all(seasons.map(...))` vuelve a colarse sin que la suite se entere.
describe("getSeriesEpisodes — techo y concurrencia (#676)", () => {
  const originalApiKey = process.env.TMDB_API_KEY;

  beforeEach(() => {
    process.env.TMDB_API_KEY = "dummy-key";
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Cuenta peticiones y vuelo simultáneo. La respuesta resuelve en el siguiente
  // tick para que varias puedan solaparse de verdad: con una respuesta síncrona
  // el pico sería 1 aunque el código lanzara las mil de golpe, y el test no
  // probaría nada.
  function trackingFetch() {
    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 0));
      inFlight--;
      return { ok: true, json: async () => ({ episodes: [] }) };
    });
    return { fetchMock, stats: () => ({ peak, calls }) };
  }

  it("nunca lanza más de 4 peticiones a la vez", async () => {
    const { fetchMock, stats } = trackingFetch();
    vi.stubGlobal("fetch", fetchMock);

    await getSeriesEpisodes(42, 20);

    const { peak, calls } = stats();
    expect(calls).toBe(20);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("recorta un total_seasons absurdo al techo en vez de lanzar 100000 peticiones", async () => {
    const { fetchMock, stats } = trackingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await getSeriesEpisodes(42, 100000);

    expect(stats().calls).toBe(80);
    expect(warn).toHaveBeenCalled();
  });

  it("mantiene el orden de las temporadas pese a resolver desordenado", async () => {
    // La temporada 1 tarda más que la 2: si el resultado se acumulara por orden
    // de llegada, saldría la 2 antes que la 1.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const n = Number(url.match(/season\/(\d+)/)![1]);
        await new Promise((r) => setTimeout(r, n === 1 ? 5 : 0));
        return {
          ok: true,
          json: async () => ({
            episodes: [{ season_number: n, episode_number: 1, name: `T${n}` }],
          }),
        };
      })
    );

    const episodes = await getSeriesEpisodes(42, 2);

    expect(episodes.map((e) => e.seasonNumber)).toEqual([1, 2]);
  });

  it("total_seasons 0 o negativo -> sin peticiones", async () => {
    const { fetchMock, stats } = trackingFetch();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getSeriesEpisodes(42, 0)).toEqual([]);
    expect(await getSeriesEpisodes(42, -5)).toEqual([]);
    expect(stats().calls).toBe(0);
  });
});
