import { describe, expect, it, vi } from "vitest";
import { findLocalBookByIsbn } from "./local-search";

// El ISBN vive en `book_editions` (spec §1 del plan obra/edición/representación):
// `books.isbn` deja de leerse aquí. Este test cubre el join, no el mapeo de
// columnas (eso ya lo cubre implícitamente cualquier resultado con datos).

type Chain = {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};

function fakeSupabase(result: { data: unknown; error?: unknown }): Chain {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, limit, maybeSingle };
}

const BOOK_ROW = {
  id: "book-1",
  openlibrary_work_key: "/works/OL1W",
  title: "Título",
  author: "Autora",
  cover_url: "https://cover",
  published_year: 2020,
  synopsis: null,
  genres: null,
  wikidata_id: null,
};

describe("findLocalBookByIsbn", () => {
  it("consulta book_editions (no books) con inner join a books, filtrando por isbn", async () => {
    const { from, eq } = fakeSupabase({ data: { isbn: "9788410138407", book: BOOK_ROW } });

    await findLocalBookByIsbn({ from } as never, "9788410138407");

    expect(from).toHaveBeenCalledWith("book_editions");
    expect(eq).toHaveBeenCalledWith("isbn", "9788410138407");
  });

  it("edición con libro (objeto único) -> SearchResult con matchedIsbn", async () => {
    const { from } = fakeSupabase({ data: { isbn: "9788410138407", book: BOOK_ROW } });

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
    const { from } = fakeSupabase({ data: { isbn: "9788410138407", book: [BOOK_ROW] } });

    const result = await findLocalBookByIsbn({ from } as never, "9788410138407");

    expect(result?.catalogId).toBe("book-1");
    expect(result?.matchedIsbn).toBe("9788410138407");
  });

  it("libro como array vacío (defensivo) -> null", async () => {
    const { from } = fakeSupabase({ data: { isbn: "9788410138407", book: [] } });

    expect(await findLocalBookByIsbn({ from } as never, "9788410138407")).toBeNull();
  });

  it("sin edición con ese ISBN -> null (el inner join ya descarta huérfanas)", async () => {
    const { from } = fakeSupabase({ data: null });

    expect(await findLocalBookByIsbn({ from } as never, "0000000000000")).toBeNull();
  });
});
