import { describe, expect, it, vi, afterEach } from "vitest";
import { findOrCreateBookAuthorByKey } from "./find-or-create-person";

// El caso que importa es el 23505. Hasta hoy, cuando dos grafías del mismo autor
// chocaban contra el índice único parcial `people_openlibrary_key_key`, el catch
// re-seleccionaba POR NOMBRE, no encontraba nada, lanzaba, y
// `ensureItemEnriched` se tragaba la excepción: el libro se quedaba sin NINGÚN
// crédito, en silencio. Aquí se comprueba que ya no.

type PeopleRow = { id: string; openlibrary_key: string };

/** Doble mínimo: `people` responde a select por openlibrary_key y a insert. */
function fakeSupabase(options: {
  existing?: PeopleRow[];
  insertError?: { code: string; message: string };
  /** Filas visibles SOLO en el re-select posterior al error (la carrera). */
  afterRace?: PeopleRow[];
}) {
  let selectCount = 0;
  const inserted: Array<Record<string, unknown>> = [];

  return {
    inserted,
    from() {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              selectCount += 1;
              const pool = selectCount === 1 ? (options.existing ?? []) : (options.afterRace ?? []);
              const row = pool.find((r) => r.openlibrary_key === value) ?? null;
              return {
                limit() {
                  return { maybeSingle: async () => ({ data: row, error: null }) };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return {
            select() {
              return {
                single: async () =>
                  options.insertError
                    ? { data: null, error: options.insertError }
                    : { data: { id: "nueva-persona" }, error: null },
              };
            },
          };
        },
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubAuthorFetch(payload: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => payload }));
}

describe("findOrCreateBookAuthorByKey", () => {
  it("con la persona ya guardada, la reutiliza sin llamar a la API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const supabase = fakeSupabase({
      existing: [{ id: "persona-1", openlibrary_key: "OL22161A" }],
    });

    const id = await findOrCreateBookAuthorByKey(supabase as never, "/authors/OL22161A");

    expect(id).toBe("persona-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("crea la persona con nombre canónico, alias y clave corta", async () => {
    stubAuthorFetch({
      name: "Фёдор Достоевский",
      personal_name: "Fyodor Mikhaylovich Dostoyevsky",
      photos: [12345],
    });
    const supabase = fakeSupabase({});

    const id = await findOrCreateBookAuthorByKey(supabase as never, "OL22242A");

    expect(id).toBe("nueva-persona");
    expect(supabase.inserted[0]).toMatchObject({
      name: "Fyodor Mikhaylovich Dostoyevsky",
      aliases: ["Фёдор Достоевский"],
      openlibrary_key: "OL22242A",
      photo_url: "https://covers.openlibrary.org/a/id/12345-M.jpg",
    });
  });

  it("ante 23505 recupera la fila por openlibrary_key y NO lanza", async () => {
    stubAuthorFetch({ name: "Frank Herbert" });
    const supabase = fakeSupabase({
      insertError: { code: "23505", message: "duplicate key" },
      afterRace: [{ id: "persona-ganadora", openlibrary_key: "OL79034A" }],
    });

    await expect(
      findOrCreateBookAuthorByKey(supabase as never, "OL79034A")
    ).resolves.toBe("persona-ganadora");
  });

  it("ante un error que no se puede recuperar devuelve null en vez de lanzar", async () => {
    stubAuthorFetch({ name: "Frank Herbert" });
    const supabase = fakeSupabase({
      insertError: { code: "42501", message: "permission denied" },
      afterRace: [],
    });

    await expect(
      findOrCreateBookAuthorByKey(supabase as never, "OL79034A")
    ).resolves.toBeNull();
  });

  it("sin forma latina no crea nada", async () => {
    stubAuthorFetch({ name: "Френк Герберт" });
    const supabase = fakeSupabase({});

    expect(await findOrCreateBookAuthorByKey(supabase as never, "OL7388009A")).toBeNull();
    expect(supabase.inserted).toHaveLength(0);
  });

  it("con clave vacía sale sin tocar nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const supabase = fakeSupabase({});

    expect(await findOrCreateBookAuthorByKey(supabase as never, "")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
