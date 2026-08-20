import { describe, expect, it, vi, afterEach } from "vitest";

// #725: las escrituras de `people` y `credits` ya no van con el cliente de la
// petición sino con service_role — son catálogo global y su INSERT estaba
// abierto a cualquier `authenticated`. El doble se comparte entre los dos
// clientes a propósito: así las aserciones sobre `upserted` siguen mirando lo
// que importa, qué filas se escriben.
const mocks = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mocks.service,
}));

import { ensureItemEnriched } from "./enrich-item";

// La rama de libro ya no mira el string `books.author` para saber QUIÉN escribió
// el libro: pregunta a la obra. Lo que se comprueba aquí es el contrato de
// bordes — de dónde salen las claves y qué pasa cuando no hay ninguna — no el
// mapeo de OpenLibrary (eso es de work-authors.test.ts).

type Upserted = Array<Record<string, unknown>>;
type UpsertCall = { rows: Upserted; options: unknown };

function fakeSupabase(
  upserted: Upserted,
  options: { upsertError?: { code: string; message: string } } = {},
  upsertCalls?: UpsertCall[]
) {
  let insertCount = 0;
  const doble = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return this;
            },
            // El guard `hasBilledCast`: sin créditos facturados.
            not: async () => ({ count: 0, error: null }),
            limit() {
              return { maybeSingle: async () => ({ data: null, error: null }) };
            },
          };
        },
        insert() {
          insertCount += 1;
          // Ids DISTINTOS por llamada: el índice único de `credits` hace
          // imposible que dos autores compartan person_id, y un doble que los
          // igualara dejaría pasar un fixture que en la realidad no existe.
          const id = `p-${table}-${insertCount}`;
          return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        },
        update() {
          return { eq: async () => ({ error: null }) };
        },
        upsert: async (rows: Upserted, upsertOptions: unknown) => {
          upserted.push(...rows);
          upsertCalls?.push({ rows, options: upsertOptions });
          if (options.upsertError) return { error: options.upsertError };
          return { error: null };
        },
      };
    },
  };

  // El mismo doble sirve de cliente de la petición (lecturas) y de service_role
  // (escrituras).
  mocks.service = doble;
  return doble;
}

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.service = null;
});

describe("ensureItemEnriched · libros", () => {
  it("con work key, acredita a los autores del work en su orden", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/")) {
        return {
          ok: true,
          json: async () => ({
            authors: [
              { author: { key: "/authors/OL2830895A" } },
              { author: { key: "/authors/OL9118672A" } },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ name: `Autor ${url.split("/").pop()}` }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const upserted: Upserted = [];
    const upsertCalls: UpsertCall[] = [];
    await ensureItemEnriched(fakeSupabase(upserted, {}, upsertCalls) as never, "book", {
      id: "libro-1",
      title: "El nombre del viento",
      author: "Patrick Rothfuss, Marc Simonetti",
      openlibraryWorkKey: "/works/OL8479867W",
    });

    expect(upserted).toHaveLength(2);
    expect(upserted[0]).toMatchObject({ item_type: "book", role: "author", billing_order: 0 });
    expect(upserted[1]).toMatchObject({ billing_order: 1 });
    // Dos autores reales tienen dos person_id distintos: si el doble de
    // `insert` los igualara, este fixture sería imposible en la BD real.
    expect(upserted[0].person_id).not.toBe(upserted[1].person_id);
    // `onConflict`/`ignoreDuplicates` son load-bearing: sin ellos, un insert
    // plano falla ENTERO en cuanto el autor ya está acreditado por la
    // hidratación de su propia ficha de persona.
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].options).toEqual({
      onConflict: "item_type,item_id,person_id,role",
      ignoreDuplicates: true,
    });
  });

  it("si el upsert de créditos falla, lo registra (salvo 42501, visitante anónimo)", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/")) {
        return {
          ok: true,
          json: async () => ({ authors: [{ author: { key: "/authors/OL2830895A" } }] }),
        };
      }
      return { ok: true, json: async () => ({ name: "Autor" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const upserted: Upserted = [];
    await ensureItemEnriched(
      fakeSupabase(upserted, { upsertError: { code: "23503", message: "fk violation" } }) as never,
      "book",
      {
        id: "libro-error",
        title: "Con fallo real",
        author: null,
        openlibraryWorkKey: "/works/OL1W",
      }
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // Antes este test afirmaba lo contrario: que un 42501 NO se registraba, porque
  // era el visitante anónimo escribiendo con su propia sesión y el fallo era
  // esperado. Desde #725 la escritura va con service_role, así que el anónimo
  // también escribe y un 42501 dejó de ser un desenlace normal: si aparece, es
  // que algo está mal configurado y hay que verlo en el log, no tragárselo.
  it("un 42501 ya NO se silencia: con service_role no es un desenlace esperado (#725)", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/")) {
        return {
          ok: true,
          json: async () => ({ authors: [{ author: { key: "/authors/OL2830895A" } }] }),
        };
      }
      return { ok: true, json: async () => ({ name: "Autor" }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const upserted: Upserted = [];
    await ensureItemEnriched(
      fakeSupabase(upserted, { upsertError: { code: "42501", message: "permission denied" } }) as never,
      "book",
      {
        id: "libro-anonimo",
        title: "Sin permiso",
        author: null,
        openlibraryWorkKey: "/works/OL1W",
      }
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("sin work key, la resuelve por título y autor y la guarda", async () => {
    const updates: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("search.json")) {
        return {
          ok: true,
          json: async () => ({
            docs: [{ key: "/works/OL893414W", title: "Dune", author_key: ["OL79034A"] }],
          }),
        };
      }
      return { ok: true, json: async () => ({ name: "Frank Herbert" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const upserted: Upserted = [];
    const supabase = fakeSupabase(upserted);
    const original = supabase.from;
    // Cast mecánico: el `update()` original se infiere sin parámetros, y esta
    // versión SÍ los necesita para capturar el patch. No cambia el comportamiento
    // en runtime, solo satisface al checker de tipos.
    supabase.from = ((table: string) => {
      const api = original.call(supabase, table);
      return {
        ...api,
        update: (patch: Record<string, unknown>) => {
          updates.push(JSON.stringify(patch));
          return { eq: async () => ({ error: null }) };
        },
      };
    }) as typeof supabase.from;

    await ensureItemEnriched(supabase as never, "book", {
      id: "libro-2",
      title: "Dune",
      author: "Frank Herbert",
      openlibraryWorkKey: null,
    });

    expect(updates.some((u) => u.includes("/works/OL893414W"))).toBe(true);
    expect(upserted).toHaveLength(1);
  });

  it("sin work key, si el título resuelto NO coincide, usa los autores pero no persiste la work key", async () => {
    // Guard de la Fix 2: un acierto fuzzy de título no es identidad. Los
    // autores se aprovechan igual (son útiles aunque la obra sea otra), pero
    // `books.openlibrary_work_key` —que otras features tratan como verdad—
    // no se contamina con una obra que no es la que se pidió.
    const updates: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("search.json")) {
        return {
          ok: true,
          json: async () => ({
            docs: [
              {
                key: "/works/OL999W",
                title: "Un libro completamente distinto",
                author_key: ["OL79034A"],
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ name: "Frank Herbert" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const upserted: Upserted = [];
    const supabase = fakeSupabase(upserted);
    const original = supabase.from;
    supabase.from = ((table: string) => {
      const api = original.call(supabase, table);
      return {
        ...api,
        update: (patch: Record<string, unknown>) => {
          updates.push(JSON.stringify(patch));
          return { eq: async () => ({ error: null }) };
        },
      };
    }) as typeof supabase.from;

    await ensureItemEnriched(supabase as never, "book", {
      id: "libro-titulo-distinto",
      title: "Dune",
      author: "Frank Herbert",
      openlibraryWorkKey: null,
    });

    expect(updates).toHaveLength(0);
    expect(upserted).toHaveLength(1);
  });

  it("sin obra resoluble no escribe ningún crédito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) })
    );

    const upserted: Upserted = [];
    await ensureItemEnriched(fakeSupabase(upserted) as never, "book", {
      id: "libro-3",
      title: "Libro sin obra",
      author: "Alguien Desconocido",
      openlibraryWorkKey: null,
    });

    expect(upserted).toHaveLength(0);
  });

  it("el string `books.author` ya no crea personas por su cuenta", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/")) return { ok: true, json: async () => ({ authors: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const upserted: Upserted = [];
    await ensureItemEnriched(fakeSupabase(upserted) as never, "book", {
      id: "libro-4",
      title: "Obra sin autores",
      author: "Traductor Fulano, Ilustrador Mengano",
      openlibraryWorkKey: "/works/OL1W",
    });

    expect(upserted).toHaveLength(0);
    // Ni una llamada a search/authors.json: esa vía está borrada.
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("search/authors"))).toBe(true);
  });
});
