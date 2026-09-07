vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({ rpc: h.rpc }) }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado compartido por los dobles. `vi.hoisted` porque `vi.mock` se iza por
// encima de los imports y necesita ver estas referencias ya construidas.
const h = vi.hoisted(() => {
  const state = {
    user: { id: "user-1" } as { id: string } | null,
    workKey: "/works/OL1W" as string | null,
    bookRowMissing: false,
    persistedIsbns: [] as Array<{ isbn: string | null }>,
    rpcResult: { data: "edition-nueva" as string | null, error: null as unknown },
    existingByIsbn: null as { id: string } | null,
    setPassEditionThrows: false,
  };

  // Se tipa la FIRMA (aunque la implementación ignore los argumentos) para
  // poder inspeccionar `rpc.mock.calls[0][1]`: ahí es donde se comprueba QUÉ
  // metadatos se escriben en el catálogo comunitario.
  const rpc = vi.fn<
    (name: string, args: Record<string, unknown>) => Promise<typeof state.rpcResult>
  >(async () => state.rpcResult);
  const setPassEdition = vi.fn(async () => {
    if (state.setPassEditionThrows) throw new Error("boom");
  });
  // Qué tablas se han consultado. Es lo que distingue "salió por el atajo" de
  // "hizo el trabajo entero y casualmente devolvió lo mismo".
  const tables: string[] = [];

  // Doble del cliente de Supabase: solo las dos tablas que toca este módulo.
  // Encadena igual que el builder real (`select().eq()…`) y termina en
  // `maybeSingle()` o en un `then` (la promesa implícita del builder).
  function client() {
    return {
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      rpc: vi.fn(() => { throw new Error("Unverified session RPC must not register provider metadata"); }),
      from(table: string) {
        tables.push(table);
        if (table === "books") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.bookRowMissing
                    ? null
                    : { openlibrary_work_key: state.workKey },
                  error: null,
                }),
              }),
            }),
          };
        }
        // book_editions: la lista de ISBN ya persistidos (lectura sin
        // `maybeSingle`) y el rescate por (book_id, isbn) tras un conflicto.
        return {
          select: () => ({
            eq: () => ({
              not: async () => ({ data: state.persistedIsbns, error: null }),
              eq: () => ({
                maybeSingle: async () => ({ data: state.existingByIsbn, error: null }),
              }),
            }),
          }),
        };
      },
    };
  }

  return { state, rpc, setPassEdition, client, tables };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => h.client(),
  createPublicClient: () => h.client(),
}));
vi.mock("@/lib/passes/actions", () => ({ setPassEdition: h.setPassEdition }));

import { chooseEditionCandidate, fetchEditionCandidates } from "./fetch-candidates";

// Un documento de edición de OpenLibrary tal como llega de editions.json.
function doc(
  isbn: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    title: "Título",
    isbn_13: [isbn],
    publishers: ["Anagrama"],
    publish_date: "2019",
    number_of_pages: 300,
    languages: [{ key: "/languages/spa" }],
    physical_format: "Paperback",
    covers: [123],
    ...extra,
  };
}

// ISBN-13 con dígito de control VÁLIDO (los inventados los tira pickEditions).
const VALID = [
  "9788433920423",
  "9788420412146",
  "9788478884452",
  "9780141439518",
  "9780307474278",
];

function respondWith(entries: Array<Record<string, unknown>>, size?: number) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ entries, size: size ?? entries.length }),
  }));
}

beforeEach(() => {
  h.state.user = { id: "user-1" };
  h.state.workKey = "/works/OL1W";
  h.state.bookRowMissing = false;
  h.state.persistedIsbns = [];
  h.state.rpcResult = { data: "edition-nueva", error: null };
  h.state.existingByIsbn = null;
  h.state.setPassEditionThrows = false;
  h.rpc.mockClear();
  h.setPassEdition.mockClear();
  h.tables.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchEditionCandidates", () => {
  it("sin work key sale por el atajo: ni OpenLibrary ni segunda consulta", async () => {
    h.state.workKey = null;
    const fetchMock = respondWith([doc(VALID[0])]);
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchEditionCandidates("book-1")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    // Solo se miró `books`: sin obra a la que preguntar, la lista de ISBN
    // persistidos no sirve para nada y no se paga su roundtrip.
    expect(h.tables).toEqual(["books"]);
  });

  // Al exportarse de un módulo "use server" esto es un endpoint POST abierto:
  // sin la guarda, cualquiera puede quemar la cuota de OpenLibrary de nuestra
  // IP a 2 peticiones por llamada. No es fuga de datos (lo que devuelve es
  // público), es amplificación.
  it("sin sesión no llega ni a mirar el libro ni a OpenLibrary", async () => {
    h.state.user = null;
    const fetchMock = respondWith([doc(VALID[0])]);
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchEditionCandidates("book-1")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.tables).toEqual([]);
  });

  it("con work key sí pregunta a OpenLibrary (control del caso de arriba)", async () => {
    const fetchMock = respondWith([doc(VALID[0])]);
    vi.stubGlobal("fetch", fetchMock);

    await fetchEditionCandidates("book-1");

    expect(fetchMock).toHaveBeenCalled();
    expect(h.tables).toEqual(["books", "book_editions"]);
  });

  it("mapea la edición de OpenLibrary a candidata", async () => {
    vi.stubGlobal("fetch", respondWith([doc(VALID[0])]));

    const candidates = await fetchEditionCandidates("book-1");

    expect(candidates).toEqual([
      {
        isbn: VALID[0],
        label: "Bolsillo",
        publisher: "Anagrama",
        year: 2019,
        pages: 300,
        coverUrl: "https://covers.openlibrary.org/b/id/123-L.jpg",
        language: "ES",
      },
    ]);
  });

  it("excluye los ISBN ya persistidos del libro (no se ve dos veces la misma edición)", async () => {
    // El persistido llega con guiones, como lo teclea un colaborador: se
    // compara normalizado, no byte a byte.
    h.state.persistedIsbns = [{ isbn: "978-84-339-2042-3" }, { isbn: null }];
    vi.stubGlobal("fetch", respondWith([doc(VALID[0]), doc(VALID[1])]));

    const candidates = await fetchEditionCandidates("book-1");

    expect(candidates.map((c) => c.isbn)).toEqual([VALID[1]]);
  });

  it("no escribe NADA en la base de datos (ni RPC ni insert)", async () => {
    vi.stubGlobal("fetch", respondWith([doc(VALID[0])]));

    await fetchEditionCandidates("book-1");

    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("corta en 30 candidatas aunque OpenLibrary dé más", async () => {
    // 40 ISBN-13 con dígito de control correcto, generados sobre el prefijo
    // 978-84-9999-XXX para que pickEditions no los descarte.
    const entries = Array.from({ length: 40 }, (_, i) => doc(isbn13(i)));
    vi.stubGlobal("fetch", respondWith(entries));

    const candidates = await fetchEditionCandidates("book-1");

    expect(candidates).toHaveLength(30);
  });

  it("sigue devolviendo 30 cuando parte de lo escaneado ya estaba persistido", async () => {
    // El tope se aplica DESPUÉS de excluir las persistidas: si el escaneo se
    // limitara a 30 en crudo, las 5 persistidas dejarían solo 25 en pantalla.
    const entries = Array.from({ length: 40 }, (_, i) => doc(isbn13(i)));
    h.state.persistedIsbns = [0, 1, 2, 3, 4].map((i) => ({ isbn: isbn13(i) }));
    vi.stubGlobal("fetch", respondWith(entries));

    const candidates = await fetchEditionCandidates("book-1");

    expect(candidates).toHaveLength(30);
    expect(candidates.some((c) => c.isbn === isbn13(0))).toBe(false);
  });

  it("el tope son 30 EN PANTALLA, aunque las persistidas no salgan en el escaneo", async () => {
    // La holgura del escaneo (30 + persistidas) es para compensar exclusiones.
    // Si las persistidas no aparecen entre lo escaneado, no se excluye nada y
    // esa holgura NO puede acabar enseñando 35 filas: el corte final manda.
    const entries = Array.from({ length: 40 }, (_, i) => doc(isbn13(i)));
    h.state.persistedIsbns = [{ isbn: "9788478884452" }, { isbn: "9780141439518" }];
    vi.stubGlobal("fetch", respondWith(entries));

    expect(await fetchEditionCandidates("book-1")).toHaveLength(30);
  });

  it("si OpenLibrary falla devuelve lista vacía en vez de lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    expect(await fetchEditionCandidates("book-1")).toEqual([]);
  });
});

describe("chooseEditionCandidate", () => {
  // Lo que OpenLibrary dice de esta tirada. Es la ÚNICA fuente de los
  // metadatos que se escriben, porque del cliente solo llega el ISBN.
  const OL_PUBLISHER = "Editorial Real";
  const OL_COVER = "https://covers.openlibrary.org/b/id/999-L.jpg";

  function stubOpenLibrary(
    entries: Array<Record<string, unknown>> = [
      doc(VALID[0], { publishers: [OL_PUBLISHER], covers: [999] }),
    ]
  ) {
    const fetchMock = respondWith(entries);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    stubOpenLibrary();
  });

  it("registra la edición y la asocia al pase", async () => {
    const result = await chooseEditionCandidate("pass-1", "book-1", VALID[0]);

    expect(result).toEqual({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("register_verified_book_edition", {
      p_book_id: "book-1",
      p_created_by: "user-1",
      p_isbn: VALID[0],
      p_label: "Bolsillo",
      p_publisher: OL_PUBLISHER,
      p_year: 2019,
      p_pages: 300,
      p_cover_url: OL_COVER,
    });
    expect(h.setPassEdition).toHaveBeenCalledWith(
      "pass-1",
      "book",
      "book-1",
      "edition-nueva"
    );
  });

  // ── El agujero que cierra la firma nueva (I1) ───────────────────────────
  // `register_book_edition` es SECURITY DEFINER y solo exige sesión: lo que
  // llegue en `p_publisher`/`p_cover_url` acaba en el catálogo COMUNITARIO y
  // se le pinta a todo el mundo. Por eso del navegador solo puede venir el
  // ISBN, y el servidor re-deriva el resto contra OpenLibrary.

  it("una candidata falsificada por el cliente no llega a la RPC", async () => {
    // Un atacante manda el objeto candidata entero (la forma vieja de la
    // firma) con editorial y portada de su elección.
    const forged = {
      isbn: VALID[0],
      label: "<script>",
      publisher: "EDITORIAL FALSIFICADA",
      year: 1000,
      pages: 99999,
      coverUrl: "https://evil.example/portada.jpg",
      language: "ES",
    };

    const result = await chooseEditionCandidate(
      "pass-1",
      "book-1",
      forged as unknown as string
    );

    // No cuela ni a medias: la firma solo acepta un ISBN, así que la llamada
    // muere antes de tocar la RPC.
    expect(result).toEqual({ ok: false, reason: "invalidIsbn" });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("lo escrito son los metadatos de OpenLibrary, no los que el navegador tuviera", async () => {
    // La lista del navegador pudo haberse manipulado para enseñar otra
    // editorial y otra portada; da igual, porque esos campos no viajan.
    await chooseEditionCandidate("pass-1", "book-1", VALID[0]);

    const args = h.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_publisher).toBe(OL_PUBLISHER);
    expect(args.p_cover_url).toBe(OL_COVER);
    expect(args.p_label).toBe("Bolsillo");
    expect(args.p_year).toBe(2019);
    expect(args.p_pages).toBe(300);
    // Y la portada solo puede ser de covers.openlibrary.org, porque la
    // construye `buildCoverUrl` en servidor.
    expect(String(args.p_cover_url)).toMatch(/^https:\/\/covers\.openlibrary\.org\//);
  });

  it("un ISBN válido que OpenLibrary no da para esta obra se rechaza; no se inventa la fila", async () => {
    // La obra solo ofrece VALID[0]; se pide VALID[1].
    const result = await chooseEditionCandidate("pass-1", "book-1", VALID[1]);

    expect(result).toEqual({ ok: false, reason: "unknownCandidate" });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.setPassEdition).not.toHaveBeenCalled();
  });

  it("si OpenLibrary no responde no se escribe nada: sin metadatos de confianza no hay fila", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    expect(await chooseEditionCandidate("pass-1", "book-1", VALID[0])).toEqual({
      ok: false,
      reason: "unknownCandidate",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("libro sin work key: tampoco hay de dónde re-derivar", async () => {
    h.state.workKey = null;

    expect(await chooseEditionCandidate("pass-1", "book-1", VALID[0])).toEqual({
      ok: false,
      reason: "unknownCandidate",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("el ISBN del cliente se normaliza antes de casarlo (guiones incluidos)", async () => {
    const result = await chooseEditionCandidate("pass-1", "book-1", "978-84-339-2042-3");

    expect(result).toEqual({ ok: true });
    expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_isbn: VALID[0] });
  });
  // ───────────────────────────────────────────────────────────────────────

  it("la RPC devuelve NULL (ya existía): re-selecciona por (book_id, isbn) y NO falla", async () => {
    h.state.rpcResult = { data: null, error: null };
    h.state.existingByIsbn = { id: "edition-vieja" };

    const result = await chooseEditionCandidate("pass-1", "book-1", VALID[0]);

    expect(result).toEqual({ ok: true });
    expect(h.setPassEdition).toHaveBeenCalledWith(
      "pass-1",
      "book",
      "book-1",
      "edition-vieja"
    );
  });

  it("NULL y además no se encuentra por (book_id, isbn): error de dominio", async () => {
    h.state.rpcResult = { data: null, error: null };
    h.state.existingByIsbn = null;

    expect(await chooseEditionCandidate("pass-1", "book-1", VALID[0])).toEqual({
      ok: false,
      reason: "registerFailed",
    });
    expect(h.setPassEdition).not.toHaveBeenCalled();
  });

  it("ISBN inválido no llega ni a preguntarle a OpenLibrary", async () => {
    const fetchMock = stubOpenLibrary();

    const result = await chooseEditionCandidate("pass-1", "book-1", "1234567890123");

    expect(result).toEqual({ ok: false, reason: "invalidIsbn" });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin sesión devuelve {ok:false} en vez de lanzar", async () => {
    h.state.user = null;

    expect(await chooseEditionCandidate("pass-1", "book-1", VALID[0])).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("si la RPC falla devuelve {ok:false}, nunca lanza, y NO cae en el rescate", async () => {
    h.state.rpcResult = { data: null, error: { message: "invalid isbn13" } };
    // Hay una fila que el rescate por (book_id, isbn) encontraría. No debe
    // usarse: un ERROR de la RPC no es un conflicto, y colar aquí la fila
    // vieja convertiría un rechazo del servidor en un éxito silencioso.
    h.state.existingByIsbn = { id: "edition-que-no-toca" };

    expect(await chooseEditionCandidate("pass-1", "book-1", VALID[0])).toEqual({
      ok: false,
      reason: "registerFailed",
    });
    expect(h.setPassEdition).not.toHaveBeenCalled();
  });

  it("si asociar el pase revienta devuelve {ok:false}, nunca lanza", async () => {
    h.state.setPassEditionThrows = true;

    expect(await chooseEditionCandidate("pass-1", "book-1", VALID[0])).toEqual({
      ok: false,
      reason: "generic",
    });
  });
});

// ISBN-13 sintético con dígito de control correcto: 978849999 + 3 dígitos de
// índice + checksum. Sin esto pickEditions descartaría los 40 de golpe y el
// test del tope no probaría nada.
function isbn13(index: number): string {
  const base = `978849999${String(index).padStart(3, "0")}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return base + String((10 - (sum % 10)) % 10);
}
