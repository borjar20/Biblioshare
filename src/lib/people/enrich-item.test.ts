import { describe, expect, it, vi, beforeEach } from "vitest";
import { needsBackdrop, needsSizeHydration, ensureItemEnriched } from "./enrich-item";

// Mocks de todo lo que haría I/O en la rama de cine de ensureItemEnriched.
// getMovieDetails es el único que varía entre tests (controla si TMDB trae
// backdropUrl); el resto solo necesita existir para que el módulo cargue.
const getMovieDetails = vi.fn();
vi.mock("@/lib/catalog/tmdb", () => ({
  getMovieDetails: (...args: unknown[]) => getMovieDetails(...args),
  getSeriesDetails: vi.fn(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/sagas/persist-collection", () => ({
  persistCollectionMembership: vi.fn().mockResolvedValue([]),
}));
vi.mock("./find-or-create-person", () => ({
  findOrCreatePeopleByTmdb: vi.fn().mockResolvedValue(new Map()),
  findOrCreateBookAuthorByKey: vi.fn(),
}));

// Fake mínimo de un SupabaseServerClient: solo cubre lo que
// ensureItemEnriched usa en la rama de cine antes de llegar a
// getMovieDetails — hasBilledCast (`from("credits").select().eq().eq().not()`)
// y la RPC de escritura del backdrop.
function makeFakeSupabase() {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    if (table !== "credits") throw new Error(`tabla inesperada en el fake: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            // Reparto ya facturado presente: needsCredits = false, así el
            // test se centra solo en el guard del backdrop.
            not: () => Promise.resolve({ count: 1 }),
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
