import { describe, expect, it, vi, beforeEach } from "vitest";

// hydrate-book.ts tenía cobertura CERO, y la revisión de la Task 9 midió sobre
// los 280 tests del repo que CUATRO mutaciones sobrevivían a la suite entera:
//
//   M1  borrar `p_author` de la llamada a la RPC   (recaída literal de #730)
//   M2  cambiar `createServiceRoleClient()` por el cliente de la petición (#871)
//   M3  intercambiar las candidatas ES y EN
//   M4  quitar el `Math.round` de la mediana de páginas
//
// M1 y M2 son los dos bugs que esta tarea existe para cerrar, y los dos fueron
// SILENCIOSOS en producción: la RPC marca `hydrated_at` igual (M1) y el error
// 42501 solo se registraba (M2). Cada bloque de abajo dice qué mutación mata.
//
// Todo lo externo va mockeado: este fichero prueba la ORQUESTACIÓN (qué se le
// pide a quién, con qué cliente y qué se le propone a la RPC), no los
// proveedores — de eso ya hay tests propios en openlibrary/, inventaire/ y
// googlebooks/.

const mocks = vi.hoisted(() => ({
  service: null as unknown,
  fetchWork: vi.fn(),
  fetchFirstEditionDescription: vi.fn(),
  fetchOpenLibraryAuthorByKey: vi.fn(),
  resolveWorkKey: vi.fn(),
  fetchRepresentationCandidates: vi.fn(),
  searchInventaireEntities: vi.fn(),
  findBestVolume: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mocks.service,
}));
vi.mock("./openlibrary/work-detail", () => ({
  fetchWork: mocks.fetchWork,
  fetchFirstEditionDescription: mocks.fetchFirstEditionDescription,
}));
vi.mock("./openlibrary/work-authors", () => ({
  fetchOpenLibraryAuthorByKey: mocks.fetchOpenLibraryAuthorByKey,
}));
vi.mock("./openlibrary/editions", () => ({
  resolveWorkKey: mocks.resolveWorkKey,
  fetchRepresentationCandidates: mocks.fetchRepresentationCandidates,
}));
// `qidFromUri` es puro y se deja REAL: mockearlo escondería que el QID sale de
// una uri `wd:Qnnn` y no de otra cosa.
vi.mock("./inventaire/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./inventaire/client")>()),
  searchInventaireEntities: mocks.searchInventaireEntities,
}));
vi.mock("./googlebooks/client", () => ({ findBestVolume: mocks.findBestVolume }));

import { ensureBookHydrated, bookShellFromSearchResult, type HydratableBook } from "./hydrate-book";
import type { GoogleVolume } from "./googlebooks/client";
import type { SearchResult } from "./types";

// Dos clientes DISTINTOS a propósito (M2): el de la petición, que es el que
// recibe `ensureBookHydrated` como argumento, y el de service_role, que la
// función construye por su cuenta. Si la RPC se llamara con el equivocado, las
// dos aserciones del bloque de M2 lo dicen.
function makeClients() {
  const ok = { error: null };
  const build = (rpc: ReturnType<typeof vi.fn>) => {
    const updates: Array<Record<string, unknown>> = [];
    return {
      rpc,
      updates,
      from: () => ({
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          // La cadena real es `.update().eq()` y, para las columnas técnicas,
          // `.update().eq().is()`. Una promesa con `.is` colgado cubre ambas.
          const eq = Object.assign(Promise.resolve(ok), { is: () => Promise.resolve(ok) });
          return { eq: () => eq };
        },
      }),
    };
  };
  const request = build(vi.fn().mockResolvedValue(ok));
  const service = build(vi.fn().mockResolvedValue(ok));
  mocks.service = service;
  return { request, service };
}

type RpcArgs = Record<string, unknown>;
type Fields = Record<string, { value: string; lang: string; source: string }>;

function rpcArgs(client: { rpc: ReturnType<typeof vi.fn> }): RpcArgs {
  expect(client.rpc).toHaveBeenCalledTimes(1);
  const [name, args] = client.rpc.mock.calls[0] as [string, RpcArgs];
  expect(name).toBe("hydrate_book");
  return args;
}

const volume = (over: Partial<GoogleVolume> = {}): GoogleVolume => ({
  volumeId: "gb-1",
  title: "Palabras radiantes",
  authors: ["Brandon Sanderson"],
  isbns: [],
  synopsis: null,
  coverUrl: null,
  pageCount: null,
  language: null,
  ...over,
});

const book = (over: Partial<HydratableBook> = {}): HydratableBook => ({
  id: "b1",
  openlibrary_work_key: "/works/OL1W",
  isbn: null,
  hydrated_at: null,
  repr_meta: null,
  wikidata_id: null,
  title: null,
  author: null,
  total_pages: null,
  ...over,
});

const workConSinopsisInglesa = {
  title: "Words of Radiance",
  description: "The OpenLibrary blurb",
  subjects: [],
  coverUrl: null,
  authorKeys: ["OL1A"],
  firstPublishYear: null,
};

const workSinAutores = {
  title: "Words of Radiance",
  description: null,
  subjects: [],
  coverUrl: null,
  authorKeys: [],
  firstPublishYear: null,
};

const days = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchWork.mockResolvedValue({
    title: "Words of Radiance",
    description: null,
    subjects: [],
    coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
    authorKeys: ["OL1A"],
    firstPublishYear: 2014,
  });
  mocks.fetchFirstEditionDescription.mockResolvedValue(null);
  mocks.fetchOpenLibraryAuthorByKey.mockResolvedValue({
    key: "OL1A",
    name: "Brandon Sanderson",
    aliases: [],
    bio: null,
    photoUrl: null,
    birthDate: null,
    deathDate: null,
  });
  mocks.resolveWorkKey.mockResolvedValue(null);
  mocks.fetchRepresentationCandidates.mockResolvedValue({ es: null, en: null, pagesMedian: null });
  mocks.searchInventaireEntities.mockResolvedValue([]);
  mocks.findBestVolume.mockResolvedValue(null);
});

// ───────────────────────────── M1 · p_author ─────────────────────────────
describe("ensureBookHydrated · autoría (mata M1: borrar p_author)", () => {
  it("manda p_author con el nombre que resuelve OpenLibrary", async () => {
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(rpcArgs(service).p_author).toBe("Brandon Sanderson");
  });

  // Sin esto, un libro hidratado desde la ficha se quedaba SIN AUTOR PARA
  // SIEMPRE: la RPC marca `hydrated_at` igual y el curador no reintenta lo ya
  // marcado. Es el defecto de #730, y v3 lo reintrodujo.
  it("sin autoría conocida NO manda p_author (mejor hueco que cadena vacía)", async () => {
    mocks.fetchWork.mockResolvedValue(workSinAutores);
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(rpcArgs(service).p_author).toBeUndefined();
  });

  it("cae al autor que ya tiene la fila si OpenLibrary no lista ninguno", async () => {
    mocks.fetchWork.mockResolvedValue(workSinAutores);
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book({ author: "Sanderson, Brandon" }));
    expect(rpcArgs(service).p_author).toBe("Sanderson, Brandon");
  });
});

// ──────────────────────── M2 · quién llama a la RPC ───────────────────────
describe("ensureBookHydrated · cliente de la RPC (mata M2: service_role)", () => {
  // La RPC perdió el grant de `authenticated` al pasar a fill-or-upgrade
  // (20260884): con el cliente de la petición devuelve 42501, y como el error
  // solo se registra la hidratación quedaba rota EN SILENCIO (#871).
  it("hydrate_book va con service_role, NO con el cliente de la petición", async () => {
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(service.rpc).toHaveBeenCalledWith("hydrate_book", expect.anything());
    expect(request.rpc).not.toHaveBeenCalled();
  });

  // La otra mitad del contrato: las columnas técnicas (null → valor) SÍ siguen
  // yendo con el cliente del llamante, que es lo que RLS permite.
  it("el update de google_books_volume_id va con el cliente de la petición", async () => {
    mocks.findBestVolume.mockResolvedValue(volume({ synopsis: "Sinopsis", language: "es" }));
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(request.updates).toEqual([{ google_books_volume_id: "gb-1" }]);
    expect(service.updates).toEqual([]);
  });

  it("un error de la RPC no lanza ni tumba el render", async () => {
    const { request, service } = makeClients();
    service.rpc.mockResolvedValue({ error: { code: "42501", message: "denied" } });
    await expect(ensureBookHydrated(request as never, book())).resolves.toBeUndefined();
  });

  it("nunca lanza aunque el proveedor reviente", async () => {
    mocks.fetchWork.mockRejectedValue(new Error("boom"));
    const { request } = makeClients();
    await expect(ensureBookHydrated(request as never, book())).resolves.toBeUndefined();
  });
});

// ─────────────────── M3 · política ES → EN → lo que haya ──────────────────
describe("ensureBookHydrated · política de idioma (mata M3: ES/EN intercambiadas)", () => {
  it("con edición española e inglesa gana la ESPAÑOLA, etiquetada es", async () => {
    mocks.fetchRepresentationCandidates.mockResolvedValue({
      es: { title: "Palabras radiantes", coverUrl: "https://covers/es.jpg", pages: 1200 },
      en: { title: "Words of Radiance", coverUrl: "https://covers/en.jpg", pages: 1088 },
      pagesMedian: null,
    });
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    expect(fields.title).toEqual({
      value: "Palabras radiantes",
      lang: "es",
      source: "openlibrary",
    });
    expect(fields.cover).toEqual({
      value: "https://covers/es.jpg",
      lang: "es",
      source: "openlibrary",
    });
  });

  it("sin edición española cae a la INGLESA, etiquetada en (no como es)", async () => {
    mocks.fetchRepresentationCandidates.mockResolvedValue({
      es: null,
      en: { title: "Words of Radiance", coverUrl: "https://covers/en.jpg", pages: 1088 },
      pagesMedian: null,
    });
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    expect(fields.title).toEqual({ value: "Words of Radiance", lang: "en", source: "openlibrary" });
  });

  it("sin ninguna edición cae al título del work, etiquetado other", async () => {
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    expect(fields.title).toEqual({
      value: "Words of Radiance",
      lang: "other",
      source: "openlibrary",
    });
  });
});

// ─────────────────────────── M4 · mediana entera ──────────────────────────
describe("ensureBookHydrated · páginas (mata M4: quitar Math.round)", () => {
  // El parámetro de la RPC es `integer`: con un .5 sin redondear PostgREST
  // rechaza la llamada ENTERA, no solo las páginas.
  it("redondea la mediana con número PAR de ediciones", async () => {
    mocks.fetchRepresentationCandidates.mockResolvedValue({
      es: null,
      en: null,
      pagesMedian: 301.5,
    });
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const args = rpcArgs(service);
    expect(args.p_total_pages).toBe(302);
    expect(Number.isInteger(args.p_total_pages)).toBe(true);
    expect(args.p_pages_source).toBe("openlibrary");
  });

  it("no propone páginas si la fila ya las tiene (allí es fill-only)", async () => {
    mocks.fetchRepresentationCandidates.mockResolvedValue({
      es: null,
      en: null,
      pagesMedian: 301.5,
    });
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book({ total_pages: 1088 }));
    const args = rpcArgs(service);
    expect(args.p_total_pages).toBeUndefined();
    expect(args.p_pages_source).toBeUndefined();
  });
});

// ─────────────────────────── I3 · idioma real de GB ───────────────────────
describe("ensureBookHydrated · Google Books declara su idioma (I3)", () => {
  it("un volumen INGLÉS se etiqueta en, aunque se pidiera langRestrict=es", async () => {
    mocks.findBestVolume.mockResolvedValue(volume({ synopsis: "An English blurb", language: "en" }));
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    // Etiquetarlo `es` lo sellaría en rango 0, que es TERMINAL: la RPC solo
    // acepta mejora estricta, así que nunca se corregiría (congelación de #730).
    expect(fields.synopsis).toEqual({
      value: "An English blurb",
      lang: "en",
      source: "google_books",
    });
  });

  it("un volumen español SÍ se etiqueta es", async () => {
    mocks.findBestVolume.mockResolvedValue(volume({ synopsis: "Una sinopsis", language: "es" }));
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    expect(fields.synopsis).toEqual({ value: "Una sinopsis", lang: "es", source: "google_books" });
  });

  // I-1: sin `language` declarado NO se asume "es" (el idioma pedido) — eso
  // sellaría rango 0, que es TERMINAL (la RPC solo acepta mejora estricta), y
  // una sinopsis en realidad inglesa quedaría congelada como española para
  // siempre. `toReprLang(null)` cae a "other": rellena el hueco sin cerrarlo.
  it("sin idioma declarado se etiqueta other, NUNCA es (rango 0 es terminal)", async () => {
    mocks.findBestVolume.mockResolvedValue(volume({ synopsis: "Una sinopsis", language: null }));
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    expect(fields.synopsis?.lang).toBe("other");
  });

  it("un volumen inglés NO pisa una sinopsis inglesa de OpenLibrary", async () => {
    mocks.fetchWork.mockResolvedValue(workConSinopsisInglesa);
    mocks.findBestVolume.mockResolvedValue(
      volume({ synopsis: "Another English blurb", language: "en" }),
    );
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    // Cambiar `en` por `en` no es mejora: la RPC lo rechazaría por no ser
    // estricta y de paso se perdería la procedencia mejor.
    expect(fields.synopsis).toEqual({
      value: "The OpenLibrary blurb",
      lang: "en",
      source: "openlibrary",
    });
  });
});

// ───────────────── #886 · el gate de Google Books se afloja ───────────────
describe("ensureBookHydrated · gate de Google Books (#886)", () => {
  // El caso COMÚN: `synopsisLang` etiqueta `en` toda sinopsis de OL. Con el
  // gate viejo (`<= 1`) GB no se llamaba NUNCA aquí, y la reevaluación de cada
  // 30 días era un no-op demostrable.
  it("con la sinopsis en INGLÉS sí se le pide a Google Books en español", async () => {
    mocks.fetchWork.mockResolvedValue(workConSinopsisInglesa);
    // La PORTADA se deja ya en español a propósito: si no, el bucle llamaría a
    // Google Books por ella de todas formas (su hueco está vacío) y el test
    // pasaría sin decir nada del gate de la sinopsis, que es lo que se prueba.
    mocks.fetchRepresentationCandidates.mockResolvedValue({
      es: { title: "Palabras radiantes", coverUrl: "https://covers/es.jpg", pages: 1200 },
      en: null,
      pagesMedian: null,
    });
    const { request } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(mocks.findBestVolume).toHaveBeenCalledTimes(1);
    // La consulta es el título del WORK, no el de la candidata española: es lo
    // que `titleForLookups` sabe cuando se decide la búsqueda.
    expect(mocks.findBestVolume).toHaveBeenCalledWith(
      "Words of Radiance",
      "Brandon Sanderson",
      "es",
    );
  });

  it("una sinopsis inglesa de OL SÍ la mejora una española de Google Books", async () => {
    mocks.fetchWork.mockResolvedValue(workConSinopsisInglesa);
    mocks.findBestVolume.mockResolvedValue(
      volume({ synopsis: "Una sinopsis en español", language: "es" }),
    );
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    const fields = rpcArgs(service).p_fields as Fields;
    expect(fields.synopsis).toEqual({
      value: "Una sinopsis en español",
      lang: "es",
      source: "google_books",
    });
  });

  // m-2: el `volume()` stub trae `coverUrl: null` por defecto, así que sin
  // dársela aquí la aserción de `fields.cover` pasaría por `if (!value)
  // continue` sin haber decidido NADA sobre el gate — y encima el memo (una
  // sola clave de Map para "es") ya garantiza una llamada aunque el gate de
  // `cover` desaparezca del todo. Con `coverUrl` puesta, esta prueba SÍ muere
  // si alguien aplica el gate solo a `synopsis` y deja `cover` desprotegida.
  it("con la portada YA española no se vuelve a llamar a Google Books por ella", async () => {
    mocks.fetchRepresentationCandidates.mockResolvedValue({
      es: { title: "Palabras radiantes", coverUrl: "https://covers/es.jpg", pages: 1200 },
      en: null,
      pagesMedian: null,
    });
    mocks.findBestVolume.mockResolvedValue(
      volume({ synopsis: "Una sinopsis", coverUrl: "https://covers/gb-es.jpg", language: "es" }),
    );
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    // Una sola llamada: la de la sinopsis. La portada ya está en español.
    expect(mocks.findBestVolume).toHaveBeenCalledTimes(1);
    const fields = rpcArgs(service).p_fields as Fields;
    // Sigue siendo la portada de OpenLibrary, NO la de Google Books: el gate
    // de `cover` bloqueó la propuesta aunque la llamada se hiciera (por la
    // sinopsis) y trajera una portada española de sobra.
    expect(fields.cover).toEqual({
      value: "https://covers/es.jpg",
      lang: "es",
      source: "openlibrary",
    });
  });

  // m-1: la memoización (`volumeByLang`) es lo único que mantiene el
  // presupuesto en UNA llamada cuando los dos huecos del bucle piden el mismo
  // idioma. Sustituir `if (!volumeByLang.has(wanted))` por `if (true)`
  // sobrevivía toda la suite hasta este caso: sin candidatas ES/EN ni sinopsis
  // de OpenLibrary, `synopsis` y `cover` entran los DOS al cuerpo del bucle
  // (ninguno tiene `current`, así que el gate no bloquea a ninguno), y el
  // memo debe colapsar sus dos peticiones de "es" en una sola llamada real.
  it("sin candidatas ES/EN ni sinopsis, los dos huecos piden es: UNA sola llamada (memo)", async () => {
    mocks.fetchWork.mockResolvedValue({
      title: "Words of Radiance",
      description: null,
      subjects: [],
      coverUrl: null,
      authorKeys: ["OL1A"],
      firstPublishYear: null,
    });
    mocks.fetchRepresentationCandidates.mockResolvedValue({ es: null, en: null, pagesMedian: null });
    mocks.findBestVolume.mockResolvedValue(
      volume({ synopsis: "Una sinopsis", coverUrl: "https://covers/gb-es.jpg", language: "es" }),
    );
    const { request } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(mocks.findBestVolume).toHaveBeenCalledTimes(1);
    expect(mocks.findBestVolume).toHaveBeenCalledWith("Words of Radiance", "Brandon Sanderson", "es");
  });
});

// ───────────────── I4 · el QID entra en el predicado de revisión ──────────
describe("ensureBookHydrated · guardia de revisión y QID (I4)", () => {
  const todoEs = {
    title: { lang: "es", source: "openlibrary" },
    cover: { lang: "es", source: "openlibrary" },
    synopsis: { lang: "es", source: "google_books" },
  };

  it("todo español, con QID y hace 400 días: no se gasta ni una llamada", async () => {
    const { request, service } = makeClients();
    await ensureBookHydrated(
      request as never,
      book({ hydrated_at: days(400), repr_meta: todoEs, wikidata_id: "Q1" }),
    );
    expect(service.rpc).not.toHaveBeenCalled();
    expect(mocks.fetchWork).not.toHaveBeenCalled();
    expect(mocks.searchInventaireEntities).not.toHaveBeenCalled();
  });

  // Sin I4 este caso NO se reconsideraría jamás en cuanto GB llene la sinopsis
  // española: el QID no vive en `repr_meta` y nadie lo miraba.
  it("todo español pero SIN QID: se vuelve a intentar pasado el cooldown", async () => {
    const { request, service } = makeClients();
    await ensureBookHydrated(
      request as never,
      book({ hydrated_at: days(400), repr_meta: todoEs, wikidata_id: null }),
    );
    expect(service.rpc).toHaveBeenCalled();
  });

  it("sin QID pero recién hidratado sigue respetando el cooldown", async () => {
    const { request, service } = makeClients();
    await ensureBookHydrated(
      request as never,
      book({ hydrated_at: days(1), repr_meta: todoEs, wikidata_id: null }),
    );
    expect(service.rpc).not.toHaveBeenCalled();
  });
});

// ───────────────── Identidad: el QID solo con el autor verificado ─────────
describe("ensureBookHydrated · QID de Wikidata", () => {
  it("acepta la entidad cuyo autor casa y manda su QID", async () => {
    mocks.searchInventaireEntities.mockResolvedValue([
      { uri: "wd:Q9", labels: { es: "Palabras radiantes" }, authorNames: ["Brandon Sanderson"] },
    ]);
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(rpcArgs(service).p_wikidata_id).toBe("Q9");
  });

  // Un QID equivocado FUSIONA dos obras: sin autor verificado, hueco.
  it("descarta la entidad cuyo autor NO casa", async () => {
    mocks.searchInventaireEntities.mockResolvedValue([
      { uri: "wd:Q9", labels: { es: "Otra obra" }, authorNames: ["Patrick Rothfuss"] },
    ]);
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(rpcArgs(service).p_wikidata_id).toBeUndefined();
  });

  it("una uri inv: (sin equivalente en Wikidata) no ancla identidad", async () => {
    mocks.searchInventaireEntities.mockResolvedValue([
      { uri: "inv:abc", labels: { es: "Palabras radiantes" }, authorNames: ["Brandon Sanderson"] },
    ]);
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(rpcArgs(service).p_wikidata_id).toBeUndefined();
  });
});

// ───────────────────────── Work key: resolución y fallos ──────────────────
describe("ensureBookHydrated · work key", () => {
  it("sin work key la resuelve por ISBN y la guarda con el cliente de la petición", async () => {
    mocks.resolveWorkKey.mockResolvedValue("/works/OL7W");
    const { request } = makeClients();
    await ensureBookHydrated(
      request as never,
      book({ openlibrary_work_key: null, isbn: "9788466657662" }),
    );
    expect(request.updates).toEqual([{ openlibrary_work_key: "/works/OL7W" }]);
    expect(mocks.fetchWork).toHaveBeenCalledWith("/works/OL7W");
  });

  it("con work key pero el work no responde NO se escribe nada (se reintenta)", async () => {
    mocks.fetchWork.mockResolvedValue(null);
    const { request, service } = makeClients();
    await ensureBookHydrated(request as never, book());
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("sin work key ni ISBN sigue enriqueciendo por título (no se abandona)", async () => {
    const { request, service } = makeClients();
    await ensureBookHydrated(
      request as never,
      book({ openlibrary_work_key: null, title: "Palabras radiantes" }),
    );
    expect(mocks.searchInventaireEntities).toHaveBeenCalledWith("Palabras radiantes");
    expect(service.rpc).toHaveBeenCalled();
  });
});

// ───────── I-2 · el shell de libro nunca lleva título/autor del navegador ─────────
describe("bookShellFromSearchResult (mata C1: devolver result.title/author)", () => {
  const searchResult = (over: Partial<SearchResult> = {}): SearchResult => ({
    itemType: "book",
    externalId: "/works/OL1W",
    title: "Un título que manda el navegador",
    subtitle: "Un autor que manda el navegador",
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
    ...over,
  });

  it("title y author van a null, nunca al dato del SearchResult", () => {
    const shell = bookShellFromSearchResult("b1", searchResult());
    expect(shell.title).toBeNull();
    expect(shell.author).toBeNull();
  });

  it("openlibrary_work_key es el externalId (identidad con la que nació la fila)", () => {
    const shell = bookShellFromSearchResult("b1", searchResult({ externalId: "/works/OL9W" }));
    expect(shell.openlibrary_work_key).toBe("/works/OL9W");
  });

  it("isbn es el matchedIsbn, o null si no vino ninguno", () => {
    expect(bookShellFromSearchResult("b1", searchResult({ matchedIsbn: "9788466657662" })).isbn).toBe(
      "9788466657662",
    );
    expect(bookShellFromSearchResult("b1", searchResult()).isbn).toBeNull();
  });

  it("nace sin hidratar, sin repr_meta y sin QID (fila recién creada, #674)", () => {
    const shell = bookShellFromSearchResult("b1", searchResult());
    expect(shell.hydrated_at).toBeNull();
    expect(shell.repr_meta).toBeNull();
    expect(shell.wikidata_id).toBeNull();
    expect(shell.total_pages).toBeNull();
  });
});
