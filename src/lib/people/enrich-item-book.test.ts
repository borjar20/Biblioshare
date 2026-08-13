import { describe, expect, it, vi, afterEach } from "vitest";
import { ensureItemEnriched } from "./enrich-item";

// La rama de libro ya no mira el string `books.author` para saber QUIÉN escribió
// el libro: pregunta a la obra. Lo que se comprueba aquí es el contrato de
// bordes — de dónde salen las claves y qué pasa cuando no hay ninguna — no el
// mapeo de OpenLibrary (eso es de work-authors.test.ts).

type Upserted = Array<Record<string, unknown>>;

function fakeSupabase(upserted: Upserted) {
  return {
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
          return { select: () => ({ single: async () => ({ data: { id: `p-${table}` }, error: null }) }) };
        },
        update() {
          return { eq: async () => ({ error: null }) };
        },
        upsert: async (rows: Upserted) => {
          upserted.push(...rows);
          return { error: null };
        },
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    await ensureItemEnriched(fakeSupabase(upserted) as never, "book", {
      id: "libro-1",
      title: "El nombre del viento",
      author: "Patrick Rothfuss, Marc Simonetti",
      openlibraryWorkKey: "/works/OL8479867W",
    });

    expect(upserted).toHaveLength(2);
    expect(upserted[0]).toMatchObject({ item_type: "book", role: "author", billing_order: 0 });
    expect(upserted[1]).toMatchObject({ billing_order: 1 });
  });

  it("sin work key, la resuelve por título y autor y la guarda", async () => {
    const updates: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("search.json")) {
        return {
          ok: true,
          json: async () => ({
            docs: [{ key: "/works/OL893414W", author_key: ["OL79034A"] }],
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
