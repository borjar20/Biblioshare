import { describe, expect, it, vi } from "vitest";
import { findLocalBookByIsbn } from "./local-search";

// El ISBN vive en `book_editions` (spec §1 del plan obra/edición/representación):
// `books.isbn` deja de leerse aquí. Este test cubre el join y el desempate de
// duplicados (issue #899), no el mapeo de columnas (eso ya lo cubre
// implícitamente cualquier resultado con datos).

type Chain = {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
};

// Sin `.limit()`/`.maybeSingle()`: el ISBN no es único globalmente en
// `book_editions` (solo lo es `(book_id, isbn)`), así que la consulta trae
// TODAS las ediciones con ese ISBN y `.eq()` es el final de la cadena.
function fakeSupabase(result: { data: unknown; error?: unknown }): Chain {
  const eq = vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq };
}

function bookRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "book-1",
    openlibrary_work_key: "/works/OL1W",
    title: "Título",
    author: "Autora",
    cover_url: "https://cover",
    published_year: 2020,
    synopsis: null,
    genres: null,
    wikidata_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const BOOK_ROW = bookRow();

describe("findLocalBookByIsbn", () => {
  it("consulta book_editions (no books) con inner join a books, filtrando por isbn", async () => {
    const { from, eq } = fakeSupabase({ data: [{ isbn: "9788410138407", book: BOOK_ROW }] });

    await findLocalBookByIsbn({ from } as never, "9788410138407");

    expect(from).toHaveBeenCalledWith("book_editions");
    expect(eq).toHaveBeenCalledWith("isbn", "9788410138407");
  });

  it("edición con libro (objeto único) -> SearchResult con matchedIsbn", async () => {
    const { from } = fakeSupabase({ data: [{ isbn: "9788410138407", book: BOOK_ROW }] });

    const result = await findLocalBookByIsbn({ from } as never, "9788410138407");

    expect(result).toEqual({
      itemType: "book",
      externalId: "/works/OL1W",
      catalogId: "book-1",
      title: "Título",
      subtitle: "Autora",
      coverUrl: "https://cover",
      year: 2020,
      synopsis: null,
      genres: null,
      matchedIsbn: "9788410138407",
    });
  });

  it("edición con libro tipado como array (postgrest sin probar cardinalidad) -> mapea el primero", async () => {
    const { from } = fakeSupabase({ data: [{ isbn: "9788410138407", book: [BOOK_ROW] }] });

    const result = await findLocalBookByIsbn({ from } as never, "9788410138407");

    expect(result?.catalogId).toBe("book-1");
    expect(result?.matchedIsbn).toBe("9788410138407");
  });

  it("libro como array vacío (defensivo) -> null", async () => {
    const { from } = fakeSupabase({ data: [{ isbn: "9788410138407", book: [] }] });

    expect(await findLocalBookByIsbn({ from } as never, "9788410138407")).toBeNull();
  });

  it("sin edición con ese ISBN -> null (el inner join ya descarta huérfanas)", async () => {
    const { from } = fakeSupabase({ data: [] });

    expect(await findLocalBookByIsbn({ from } as never, "0000000000000")).toBeNull();
  });

  it("data null (defensivo, PostgREST no debería devolverlo sin .maybeSingle) -> null", async () => {
    const { from } = fakeSupabase({ data: null });

    expect(await findLocalBookByIsbn({ from } as never, "0000000000000")).toBeNull();
  });

  it("ISBN atado a dos libros (issue #899) -> desempata por el más antiguo, no el primero de la respuesta", async () => {
    const older = bookRow({ id: "book-old", created_at: "2020-01-01T00:00:00Z" });
    const newer = bookRow({ id: "book-new", created_at: "2025-06-01T00:00:00Z" });
    // El más nuevo llega PRIMERO en `data` a propósito: si el código se
    // limitara a coger data[0] (o volviera a `.limit(1)` sin criterio), este
    // test fallaría aunque "por casualidad" el orden de PostgREST coincidiera
    // con el antiguo en otras ejecuciones.
    const { from } = fakeSupabase({
      data: [
        { isbn: "9780441013593", book: newer },
        { isbn: "9780441013593", book: older },
      ],
    });

    const result = await findLocalBookByIsbn({ from } as never, "9780441013593");

    expect(result?.catalogId).toBe("book-old");
  });
});
