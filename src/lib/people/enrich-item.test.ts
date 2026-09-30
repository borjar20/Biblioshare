import { describe, expect, it, vi, beforeEach } from "vitest";
import { needsBackdrop, needsSizeHydration, ensureItemEnriched } from "./enrich-item";

// Mocks de todo lo que haría I/O en la rama de cine de ensureItemEnriched.
// Los detalles de película y serie varían para cubrir los guards de tamaños
// y backdrop; el resto evita efectos de red durante el enriquecimiento.
const getMovieDetails = vi.fn();
const getSeriesDetails = vi.fn();
const persistCollectionMembership = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/catalog/tmdb", () => ({
  getMovieDetails: (...args: unknown[]) => getMovieDetails(...args),
  getSeriesDetails: (...args: unknown[]) => getSeriesDetails(...args),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/sagas/persist-collection", () => ({
  persistCollectionMembership: (...args: unknown[]) => persistCollectionMembership(...args),
}));
vi.mock("./find-or-create-person", () => ({
  findOrCreatePeopleByTmdb: vi.fn().mockResolvedValue(new Map()),
  findOrCreateBookAuthorByKey: vi.fn(),
}));

// Fake mínimo de un SupabaseServerClient: solo cubre lo que
// ensureItemEnriched usa en la rama de cine antes de llegar a
// getMovieDetails — hasBilledCast (`from("credits").select().eq().eq().not()`)
// y la RPC de escritura del backdrop.
function makeFakeSupabase(billedCastCount = 1) {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    if (table !== "credits") throw new Error(`tabla inesperada en el fake: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            // Reparto ya facturado presente: needsCredits = false, así el
            // test se centra solo en el guard del backdrop.
            not: () => Promise.resolve({ count: billedCastCount }),
          }),
        }),
      }),
    };
  });
  return { rpc, from } as unknown as Parameters<typeof ensureItemEnriched>[0];
}

// Película base: créditos y duración ya presentes, backdrop pendiente. Solo
// varían hydratedAt/viewerLoggedIn/lo que devuelva TMDB entre tests.
const baseMovie = {
  id: "m1",
  tmdbId: 42,
  durationMinutes: 120,
  backdropUrl: null as string | null,
};

describe("needsSizeHydration", () => {
  it("pide duración cuando la película no la tiene", () => {
    expect(needsSizeHydration("movie", { id: "m1", durationMinutes: null })).toBe(true);
  });

  it("no repite trabajo si la película ya tiene duración", () => {
    expect(needsSizeHydration("movie", { id: "m1", durationMinutes: 148 })).toBe(false);
  });

  // El caso de #365: 12 de las 20 películas pendientes YA tenían créditos y
  // seguían sin duración. Si el guard de tamaños dependiera de `creditsExist`
  // no se rellenarían nunca — por eso es independiente y por eso este test.
  it("no lo decide la ausencia de campo: undefined cuenta como que falta", () => {
    expect(needsSizeHydration("movie", { id: "m1" })).toBe(true);
  });

  it("una serie necesita AMBOS: episodios y duración de episodio", () => {
    const base = { id: "s1", totalEpisodes: 62, episodeRuntimeMinutes: 47 };
    expect(needsSizeHydration("series", base)).toBe(false);
    expect(needsSizeHydration("series", { ...base, totalEpisodes: null })).toBe(true);
    expect(needsSizeHydration("series", { ...base, episodeRuntimeMinutes: null })).toBe(true);
  });

  it("los libros no tienen tamaño que hidratar (sus páginas son de la edición)", () => {
    expect(needsSizeHydration("book", { id: "b1" })).toBe(false);
  });
});

describe("needsBackdrop", () => {
  it("pide backdrop cuando la película o la serie no lo tiene", () => {
    expect(needsBackdrop("movie", { id: "m1", backdropUrl: null })).toBe(true);
    expect(needsBackdrop("series", { id: "s1", backdropUrl: null })).toBe(true);
  });

  it("no repite trabajo si ya lo tiene", () => {
    expect(
      needsBackdrop("movie", { id: "m1", backdropUrl: "https://image.tmdb.org/t/p/w1280/x.jpg" }),
    ).toBe(false);
  });

  // Mismo motivo que needsSizeHydration: es independiente de créditos y
  // tamaños. Una obra que ya tiene reparto y duración (casi todas las viejas)
  // no lo pediría nunca si dependiera de ellos.
  it("undefined cuenta como que falta", () => {
    expect(needsBackdrop("movie", { id: "m1", durationMinutes: 120 })).toBe(true);
  });

  it("los libros no tienen backdrop de TMDB", () => {
    expect(needsBackdrop("book", { id: "b1" })).toBe(false);
  });
});

describe("ensureItemEnriched — escritura de tamaños", () => {
  beforeEach(() => {
    getMovieDetails.mockReset();
    getSeriesDetails.mockReset();
    persistCollectionMembership.mockReset();
    persistCollectionMembership.mockResolvedValue([]);
  });

  it("obra hidratada + sesión rellena la duración ausente", async () => {
    getMovieDetails.mockResolvedValue({
      collection: null,
      credits: [],
      backdropUrl: null,
      runtimeMinutes: 120,
      numberOfEpisodes: null,
      numberOfSeasons: null,
      episodeRuntimeMinutes: null,
    });
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      durationMinutes: null,
      hydratedAt: "2026-01-01T00:00:00Z",
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledWith("hydrate_movie", {
      p_movie_id: "m1",
      p_duration_minutes: 120,
    });
  });

  it("fila pendiente no escribe tamaños antes de la hidratación completa", async () => {
    getMovieDetails.mockResolvedValue({
      collection: null,
      credits: [],
      backdropUrl: null,
      runtimeMinutes: 120,
      numberOfEpisodes: null,
      numberOfSeasons: null,
      episodeRuntimeMinutes: null,
    });
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      durationMinutes: null,
      hydratedAt: null,
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).not.toHaveBeenCalled();
  });

  it("una fila pendiente sigue enriqueciendo créditos y colección, sin escribir tamaños", async () => {
    getMovieDetails.mockResolvedValue({
      collection: { id: 7, name: "Colección" },
      credits: [],
      backdropUrl: null,
      runtimeMinutes: 120,
      numberOfEpisodes: null,
      numberOfSeasons: null,
      episodeRuntimeMinutes: null,
    });
    const supabase = makeFakeSupabase(0);

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      durationMinutes: null,
      hydratedAt: null,
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(getMovieDetails).toHaveBeenCalledWith(42);
    expect(rpc).not.toHaveBeenCalled();
    expect(persistCollectionMembership).toHaveBeenCalledWith(
      supabase,
      "movie",
      "m1",
      { id: 7, name: "Colección" }
    );
  });

  it("visitante sin sesión no intenta escribir tamaños ni registra el fallo de autenticación", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      durationMinutes: null,
      hydratedAt: "2026-01-01T00:00:00Z",
      viewerLoggedIn: false,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("serie hidratada + sesión rellena episodios y duración de episodio ausentes", async () => {
    getSeriesDetails.mockResolvedValue({
      collection: null,
      credits: [],
      backdropUrl: null,
      runtimeMinutes: null,
      numberOfEpisodes: 12,
      numberOfSeasons: 1,
      episodeRuntimeMinutes: 45,
    });
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "series", {
      id: "s1",
      tmdbId: 24,
      totalEpisodes: null,
      episodeRuntimeMinutes: null,
      hydratedAt: "2026-01-01T00:00:00Z",
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledWith("hydrate_series", {
      p_series_id: "s1",
      p_total_episodes: 12,
      p_total_seasons: 1,
      p_episode_runtime_minutes: 45,
    });
  });

  it("una serie pendiente tampoco llama hydrate_series solo por sus tamaños", async () => {
    getSeriesDetails.mockResolvedValue({
      collection: null,
      credits: [],
      backdropUrl: null,
      runtimeMinutes: null,
      numberOfEpisodes: 12,
      numberOfSeasons: 1,
      episodeRuntimeMinutes: 45,
    });
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "series", {
      id: "s1",
      tmdbId: 24,
      totalEpisodes: null,
      episodeRuntimeMinutes: null,
      hydratedAt: null,
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).not.toHaveBeenCalled();
  });
});

// Rama de escritura del backdrop: solo se pide para filas YA hidratadas
// (`hydrated_at` no nulo) y visitantes con sesión — ver el comentario de
// `wantsBackdrop` en enrich-item.ts. Escribirlo en una fila pendiente
// marcaría `hydrated_at` antes de que la hidratación completa (`after()`)
// haya tenido ocasión de correr, dejándola marcada para siempre si esa
// hidratación luego falla (mismo bug que #1201).
describe("ensureItemEnriched — escritura del backdrop", () => {
  beforeEach(() => {
    getMovieDetails.mockReset();
  });

  it("obra hidratada + sesión + TMDB con backdrop → una sola llamada RPC con ese backdrop", async () => {
    getMovieDetails.mockResolvedValue({
      collection: null,
      credits: [],
      backdropUrl: "https://image.tmdb.org/t/p/w1280/x.jpg",
      runtimeMinutes: 120,
      numberOfEpisodes: null,
      numberOfSeasons: null,
      episodeRuntimeMinutes: null,
    });
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      hydratedAt: "2026-01-01T00:00:00Z",
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("hydrate_movie", {
      p_movie_id: "m1",
      p_backdrop_url: "https://image.tmdb.org/t/p/w1280/x.jpg",
    });
  });

  it("TMDB sin backdrop → ninguna llamada RPC", async () => {
    getMovieDetails.mockResolvedValue({
      collection: null,
      credits: [],
      backdropUrl: null,
      runtimeMinutes: 120,
      numberOfEpisodes: null,
      numberOfSeasons: null,
      episodeRuntimeMinutes: null,
    });
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      hydratedAt: "2026-01-01T00:00:00Z",
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fila pendiente (hydratedAt null) → ninguna llamada RPC, ni siquiera se consulta TMDB", async () => {
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      hydratedAt: null,
      viewerLoggedIn: true,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).not.toHaveBeenCalled();
    expect(getMovieDetails).not.toHaveBeenCalled();
  });

  it("visitante sin sesión (viewerLoggedIn false) → ninguna llamada RPC", async () => {
    getMovieDetails.mockResolvedValue({
      collection: null,
      credits: [],
      backdropUrl: "https://image.tmdb.org/t/p/w1280/x.jpg",
      runtimeMinutes: 120,
      numberOfEpisodes: null,
      numberOfSeasons: null,
      episodeRuntimeMinutes: null,
    });
    const supabase = makeFakeSupabase();

    await ensureItemEnriched(supabase, "movie", {
      ...baseMovie,
      hydratedAt: "2026-01-01T00:00:00Z",
      viewerLoggedIn: false,
    });

    const rpc = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).not.toHaveBeenCalled();
  });
});
