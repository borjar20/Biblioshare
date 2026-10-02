import { describe, expect, it, vi, beforeEach } from "vitest";
import { needsBackdrop, needsSizeHydration, ensureItemEnriched } from "./enrich-item";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/database.types";
import { findOrCreateBookAuthorByKey } from "./find-or-create-person";
import { fetchWorkAuthorKeys } from "@/lib/catalog/openlibrary/work-authors";
import { resolveWorkByTitleAuthor } from "@/lib/catalog/openlibrary/work-search";

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
vi.mock("@/lib/catalog/openlibrary/work-authors", () => ({
  fetchWorkAuthorKeys: vi.fn(),
}));
vi.mock("@/lib/catalog/openlibrary/work-search", () => ({
  resolveWorkByTitleAuthor: vi.fn(),
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

type CreditRow = Database["public"]["Tables"]["credits"]["Row"];
type CreditInsert = Database["public"]["Tables"]["credits"]["Insert"];
type CreditError = { code: string; message: string };
type CreditResult = {
  data: Array<{ id: string; billing_order?: number | null }> | null;
  count: number | null;
  error: CreditError | null;
};
type CreditQuery = {
  select: (columns?: string, options?: unknown) => CreditQuery;
  eq: (column: keyof CreditRow, value: unknown) => CreditQuery;
  is: (column: keyof CreditRow, value: null) => CreditQuery;
  not: (column: keyof CreditRow, operator: string, value: null) => CreditQuery;
  then: Promise<CreditResult>["then"];
};

function bookCredit(overrides: Partial<CreditRow> = {}): CreditRow {
  return {
    id: "credit-seeded",
    item_type: "book",
    item_id: "b1",
    person_id: "author-1",
    role: "author",
    billing_order: null,
    character: null,
    created_at: "2026-08-13T00:00:00Z",
    ...overrides,
  };
}

// Almacén con estado: el guard cuenta las filas que realmente dejaron las
// escrituras anteriores, sin preprogramar la respuesta de la segunda visita.
// El cliente de petición solo puede leer; las escrituras exigen service_role.
function makeBookCreditStore(
  initialRows: CreditRow[] = [],
  options: {
    upsertError?: CreditError | null;
    updateError?: CreditError | null;
    updateErrorPersonId?: string;
    beforeUpsert?: (rows: CreditRow[]) => void;
  } = {},
) {
  const credits = initialRows.map((row) => ({ ...row }));
  function makeQuery(patch?: Partial<CreditRow>): CreditQuery {
    const filters: Array<(row: CreditRow) => boolean> = [];
    let execution: Promise<CreditResult> | undefined;
    const execute = () => {
      execution ??= Promise.resolve().then(() => {
        const matching = credits.filter((row) => filters.every((filter) => filter(row)));
        if (patch && options.updateError && (!options.updateErrorPersonId ||
          matching.some((row) => row.person_id === options.updateErrorPersonId))) {
          return { data: null, count: null, error: options.updateError };
        }
        if (patch) matching.forEach((row) => Object.assign(row, patch));
        return { data: matching.map((row) => ({ ...row })), count: matching.length, error: null };
      });
      return execution;
    };
    const query: CreditQuery = {
      select: () => query,
      eq: (column, value) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      is: (column, value) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      not: (column, operator, value) => {
        if (operator !== "is") throw new Error(`operador inesperado: ${operator}`);
        filters.push((row) => row[column] !== value);
        return query;
      },
      then: (onfulfilled, onrejected) => execute().then(onfulfilled, onrejected),
    };
    return query;
  }

  const upsert = vi.fn((rows: CreditInsert[], { ignoreDuplicates }: { ignoreDuplicates?: boolean }) => {
    options.beforeUpsert?.(credits);
    const written: Array<{ id: string }> = [];
    if (!options.upsertError) {
      for (const row of rows) {
        const existing = credits.find((candidate) =>
          candidate.item_type === row.item_type && candidate.item_id === row.item_id &&
          candidate.person_id === row.person_id && candidate.role === row.role,
        );
        if (existing) {
          if (!ignoreDuplicates) {
            Object.assign(existing, row);
            written.push({ id: existing.id });
          }
        } else {
          const inserted = bookCredit({ id: `credit-new-${credits.length}`, ...row });
          credits.push(inserted);
          written.push({ id: inserted.id });
        }
      }
    }
    const result: CreditResult = {
      data: options.upsertError ? null : written,
      count: options.upsertError ? null : written.length,
      error: options.upsertError ?? null,
    };
    return Object.assign(Promise.resolve(result), { select: () => Promise.resolve(result) });
  });
  const update = vi.fn((patch: Partial<CreditRow>) => makeQuery(patch));
  const requestFrom = vi.fn((table: string) => {
    if (table !== "credits") throw new Error(`tabla inesperada: ${table}`);
    return makeQuery();
  });
  const serviceFrom = vi.fn((table: string) => {
    if (table !== "credits") throw new Error(`tabla inesperada: ${table}`);
    return { upsert, update };
  });
  return {
    credits,
    upsert,
    update,
    requestFrom,
    serviceFrom,
    supabase: { from: requestFrom } as unknown as Parameters<typeof ensureItemEnriched>[0],
    service: { from: serviceFrom } as unknown as ReturnType<typeof createServiceRoleClient>,
  };
}

const baseBook = { id: "b1", openlibraryWorkKey: "/works/OL1W" };

describe("ensureItemEnriched — convergencia de créditos de libro #633", () => {
  beforeEach(() => {
    vi.mocked(createServiceRoleClient).mockReset();
    vi.mocked(fetchWorkAuthorKeys).mockReset();
    vi.mocked(resolveWorkByTitleAuthor).mockReset();
    vi.mocked(findOrCreateBookAuthorByKey).mockReset();
    vi.mocked(fetchWorkAuthorKeys).mockResolvedValue(["/authors/OL1A"]);
    vi.mocked(findOrCreateBookAuthorByKey).mockResolvedValue("author-1");
  });

  it("un libro sembrado completa su autor y la segunda apertura no consulta al proveedor", async () => {
    const seeded = bookCredit();
    const store = makeBookCreditStore([seeded]);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    const second = await ensureItemEnriched(store.supabase, "book", baseBook);

    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(1);
    expect(findOrCreateBookAuthorByKey).toHaveBeenCalledTimes(1);
    expect(store.credits).toEqual([{ ...seeded, billing_order: 0 }]);
    expect(first).toEqual({ wroteCredits: true, sagaMembers: [] });
    expect(second).toEqual({ wroteCredits: false, sagaMembers: [] });
    expect(store.requestFrom.mock.calls.every(([table]) => table === "credits")).toBe(true);
  });

  it("completa coautores sembrados, añade los nuevos y conserva otras obras, personas y roles", async () => {
    const seeded = [
      bookCredit({ character: "Campo conservado" }),
      bookCredit({ id: "credit-coauthor", person_id: "author-2" }),
    ];
    const untouched = [
      bookCredit({ id: "credit-other-book", item_id: "b2", billing_order: 9 }),
      bookCredit({ id: "credit-movie", item_type: "movie", billing_order: 8 }),
      bookCredit({ id: "credit-editor", role: "editor", billing_order: 7 }),
      bookCredit({ id: "credit-other-person", person_id: "author-other", role: "translator" }),
    ];
    const store = makeBookCreditStore([...seeded, ...untouched]);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    vi.mocked(fetchWorkAuthorKeys).mockResolvedValue([
      "/authors/OL2A", "/authors/OL1A", "/authors/OL3A",
    ]);
    const people = new Map([
      ["/authors/OL1A", "author-1"], ["/authors/OL2A", "author-2"],
      ["/authors/OL3A", "author-3"],
    ]);
    vi.mocked(findOrCreateBookAuthorByKey).mockImplementation(async (_supabase, key) =>
      people.get(key) ?? null,
    );

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    const second = await ensureItemEnriched(store.supabase, "book", baseBook);

    expect(store.credits).toEqual([
      { ...seeded[0], billing_order: 1 },
      { ...seeded[1], billing_order: 0 },
      ...untouched,
      expect.objectContaining({
        item_type: "book", item_id: "b1", person_id: "author-3", role: "author", billing_order: 2,
      }),
    ]);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(1);
    expect(first.wroteCredits).toBe(true);
    expect(second.wroteCredits).toBe(false);
    expect(store.requestFrom.mock.calls.every(([table]) => table === "credits")).toBe(true);
    expect(store.serviceFrom.mock.calls.every(([table]) => table === "credits")).toBe(true);
  });

  it("un libro sin créditos inserta el autor y también converge", async () => {
    const store = makeBookCreditStore();
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    const second = await ensureItemEnriched(store.supabase, "book", baseBook);

    expect(store.credits).toEqual([
      expect.objectContaining({ person_id: "author-1", billing_order: 0 }),
    ]);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(1);
    expect(first.wroteCredits).toBe(true);
    expect(second.wroteCredits).toBe(false);
  });

  it("un crédito completo conserva su orden y evita consultar Open Library", async () => {
    const curated = bookCredit({ billing_order: 7, character: "Curado" });
    const store = makeBookCreditStore([curated]);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);

    expect(await ensureItemEnriched(store.supabase, "book", baseBook)).toEqual({
      wroteCredits: false, sagaMembers: [],
    });

    expect(store.credits).toEqual([curated]);
    expect(fetchWorkAuthorKeys).not.toHaveBeenCalled();
    expect(findOrCreateBookAuthorByKey).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("completa un coautor pendiente sin pisar el orden curado del autor ya presente", async () => {
    const curated = bookCredit({ billing_order: 7, character: "Curado" });
    const seeded = bookCredit({ id: "credit-coauthor", person_id: "author-2" });
    const store = makeBookCreditStore([curated, seeded]);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    vi.mocked(fetchWorkAuthorKeys).mockResolvedValue(["/authors/OL1A", "/authors/OL2A"]);
    vi.mocked(findOrCreateBookAuthorByKey).mockImplementation(async (_supabase, key) =>
      key === "/authors/OL1A" ? "author-1" : "author-2",
    );

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    const second = await ensureItemEnriched(store.supabase, "book", baseBook);

    expect(store.credits).toEqual([curated, { ...seeded, billing_order: 1 }]);
    expect(first.wroteCredits).toBe(true);
    expect(second.wroteCredits).toBe(false);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(1);
  });

  it("conserva un orden escrito entre el guard y la persistencia sin anunciar escrituras propias", async () => {
    const seeded = bookCredit({ character: "Curado" });
    const store = makeBookCreditStore([seeded], {
      beforeUpsert: (rows) => { rows[0].billing_order = 7; },
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    const second = await ensureItemEnriched(store.supabase, "book", baseBook);

    expect(store.credits).toEqual([{ ...seeded, billing_order: 7 }]);
    expect(first.wroteCredits).toBe(false);
    expect(second.wroteCredits).toBe(false);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(1);
  });

  it("una respuesta sin autores no marca el libro y permite completar el siguiente intento", async () => {
    const seeded = bookCredit();
    const store = makeBookCreditStore([seeded]);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    vi.mocked(fetchWorkAuthorKeys).mockResolvedValueOnce([]);

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    expect(store.credits).toEqual([seeded]);
    expect(first.wroteCredits).toBe(false);
    expect(createServiceRoleClient).not.toHaveBeenCalled();

    const retry = await ensureItemEnriched(store.supabase, "book", baseBook);
    const second = await ensureItemEnriched(store.supabase, "book", baseBook);
    expect(store.credits).toEqual([{ ...seeded, billing_order: 0 }]);
    expect(retry.wroteCredits).toBe(true);
    expect(second.wroteCredits).toBe(false);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(2);
  });

  it("un autor que no se pudo resolver no inventa un crédito ni bloquea el reintento", async () => {
    const seeded = bookCredit();
    const store = makeBookCreditStore([seeded]);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    vi.mocked(findOrCreateBookAuthorByKey).mockResolvedValueOnce(null);

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    expect(first.wroteCredits).toBe(false);
    expect(store.credits).toEqual([seeded]);
    expect(createServiceRoleClient).not.toHaveBeenCalled();

    await ensureItemEnriched(store.supabase, "book", baseBook);
    await ensureItemEnriched(store.supabase, "book", baseBook);
    expect(store.credits).toEqual([{ ...seeded, billing_order: 0 }]);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(2);
  });

  it("un autor sembrado que la obra no confirma conserva NULL y mantiene abierto el reintento", async () => {
    const seeded = [bookCredit(), bookCredit({ id: "credit-unconfirmed", person_id: "author-2" })];
    const store = makeBookCreditStore(seeded);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    vi.mocked(findOrCreateBookAuthorByKey).mockImplementation(async (_supabase, key) =>
      key === "/authors/OL1A" ? "author-1" : "author-2",
    );

    const first = await ensureItemEnriched(store.supabase, "book", baseBook);
    const retryUnconfirmed = await ensureItemEnriched(store.supabase, "book", baseBook);
    expect(store.credits).toEqual([{ ...seeded[0], billing_order: 0 }, seeded[1]]);
    expect(first.wroteCredits).toBe(true);
    expect(retryUnconfirmed.wroteCredits).toBe(false);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(2);

    vi.mocked(fetchWorkAuthorKeys).mockResolvedValue(["/authors/OL1A", "/authors/OL2A"]);
    const confirmed = await ensureItemEnriched(store.supabase, "book", baseBook);
    expect(confirmed.wroteCredits).toBe(true);
    expect(store.credits).toEqual([
      { ...seeded[0], billing_order: 0 }, { ...seeded[1], billing_order: 1 },
    ]);
    expect((await ensureItemEnriched(store.supabase, "book", baseBook)).wroteCredits).toBe(false);
    expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(3);
  });

  it("el fallo de inserción no intenta completar filas y permite reintentar", async () => {
    const seeded = bookCredit();
    const options = { upsertError: { code: "42501", message: "denied" } as CreditError | null };
    const store = makeBookCreditStore([seeded], options);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const first = await ensureItemEnriched(store.supabase, "book", baseBook);
      expect(first.wroteCredits).toBe(false);
      expect(store.credits).toEqual([seeded]);
      expect(store.update).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith("book credits upsert failed", expect.any(Object));

      options.upsertError = null;
      await ensureItemEnriched(store.supabase, "book", baseBook);
      await ensureItemEnriched(store.supabase, "book", baseBook);
      expect(store.credits).toEqual([{ ...seeded, billing_order: 0 }]);
      expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("el fallo al completar el orden no anuncia una escritura y no impide reintentar", async () => {
    const seeded = bookCredit();
    const options = { updateError: { code: "42501", message: "denied" } as CreditError | null };
    const store = makeBookCreditStore([seeded], options);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const first = await ensureItemEnriched(store.supabase, "book", baseBook);
      expect(first.wroteCredits).toBe(false);
      expect(store.credits).toEqual([seeded]);
      expect(errorSpy).toHaveBeenCalledWith("book credit billing update failed", expect.any(Object));

      options.updateError = null;
      const retry = await ensureItemEnriched(store.supabase, "book", baseBook);
      const second = await ensureItemEnriched(store.supabase, "book", baseBook);
      expect(retry.wroteCredits).toBe(true);
      expect(second.wroteCredits).toBe(false);
      expect(store.credits).toEqual([{ ...seeded, billing_order: 0 }]);
      expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(2);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("un fallo parcial de dos autores sembrados permite completar el segundo en la siguiente apertura", async () => {
    const seeded = [bookCredit(), bookCredit({ id: "credit-coauthor", person_id: "author-2" })];
    const options = {
      updateError: { code: "42501", message: "denied" } as CreditError | null,
      updateErrorPersonId: "author-2",
    };
    const store = makeBookCreditStore(seeded, options);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    vi.mocked(fetchWorkAuthorKeys).mockResolvedValue(["/authors/OL1A", "/authors/OL2A"]);
    vi.mocked(findOrCreateBookAuthorByKey).mockImplementation(async (_supabase, key) =>
      key === "/authors/OL1A" ? "author-1" : "author-2",
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const first = await ensureItemEnriched(store.supabase, "book", baseBook);
      expect(first.wroteCredits).toBe(true);
      expect(store.credits).toEqual([{ ...seeded[0], billing_order: 0 }, seeded[1]]);

      options.updateError = null;
      const retry = await ensureItemEnriched(store.supabase, "book", baseBook);
      expect(store.credits).toEqual([
        { ...seeded[0], billing_order: 0 }, { ...seeded[1], billing_order: 1 },
      ]);
      expect(retry.wroteCredits).toBe(true);
      expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(2);
      expect((await ensureItemEnriched(store.supabase, "book", baseBook)).wroteCredits).toBe(false);
      expect(fetchWorkAuthorKeys).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("la resolución por título converge sin persistir una coincidencia imperfecta", async () => {
    const seeded = bookCredit();
    const store = makeBookCreditStore([seeded]);
    vi.mocked(createServiceRoleClient).mockReturnValue(store.service);
    vi.mocked(resolveWorkByTitleAuthor).mockResolvedValue({
      workKey: "/works/OL1W", authorKeys: ["/authors/OL1A"], titleMatches: false,
    });
    const item = { id: "b1", title: "Título curado", author: "Autor curado" };

    const first = await ensureItemEnriched(store.supabase, "book", item);
    const second = await ensureItemEnriched(store.supabase, "book", item);

    expect(first.wroteCredits).toBe(true);
    expect(second.wroteCredits).toBe(false);
    expect(resolveWorkByTitleAuthor).toHaveBeenCalledTimes(1);
    expect(resolveWorkByTitleAuthor).toHaveBeenCalledWith("Título curado", "Autor curado");
    expect(fetchWorkAuthorKeys).not.toHaveBeenCalled();
    expect(store.credits).toEqual([{ ...seeded, billing_order: 0 }]);
    expect(store.requestFrom.mock.calls.every(([table]) => table === "credits")).toBe(true);
  });
});
