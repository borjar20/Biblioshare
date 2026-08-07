import { describe, expect, it } from "vitest";
import { searchAnchors } from "./anchor-search";
import { anchorHref } from "@/lib/catalog/anchor";

// Doble ligero, propio de este fichero: aplica de verdad `.in()`/`.ilike()`/
// `.limit()` (no solo los registra) porque justo eso es lo que este test
// verifica -- que searchAnchors combina biblioteca (acotada al viewer) y
// sagas/personas (globales) filtrando por el término dado.
function makeClient(data: {
  passes?: { item_type: string; item_id: string; user_id?: string; is_active?: boolean }[];
  books?: { id: string; title: string; author: string | null; cover_url: string | null }[];
  movies?: { id: string; title: string; cover_url: string | null }[];
  series?: { id: string; title: string; cover_url: string | null }[];
  sagas?: { id: string; name: string; cover_url: string | null }[];
  people?: { id: string; name: string; photo_url: string | null }[];
}) {
  function table(rows: Record<string, unknown>[]) {
    let filtered = rows;
    let idFilter: unknown[] | null = null;
    let ilikeCol: string | null = null;
    let ilikeNeedle: string | null = null;
    let limitN: number | null = null;
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filtered = filtered.filter((r) => r[column] === value);
        return builder;
      },
      in(_column: string, values: unknown[]) {
        idFilter = values;
        return builder;
      },
      ilike(column: string, pattern: string) {
        ilikeCol = column;
        ilikeNeedle = pattern.replace(/%/g, "").toLowerCase();
        return builder;
      },
      order() {
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        let result = filtered;
        if (idFilter) result = result.filter((r) => (idFilter as unknown[]).includes(r.id));
        if (ilikeCol && ilikeNeedle) {
          result = result.filter((r) =>
            String(r[ilikeCol as string] ?? "").toLowerCase().includes(ilikeNeedle as string),
          );
        }
        if (limitN != null) result = result.slice(0, limitN);
        resolve({ data: result, error: null });
      },
    };
    return builder;
  }

  return {
    from(name: string) {
      if (name === "passes") return table((data.passes ?? []) as Record<string, unknown>[]);
      if (name === "books") return table((data.books ?? []) as Record<string, unknown>[]);
      if (name === "movies") return table((data.movies ?? []) as Record<string, unknown>[]);
      if (name === "series") return table((data.series ?? []) as Record<string, unknown>[]);
      if (name === "sagas") return table((data.sagas ?? []) as Record<string, unknown>[]);
      if (name === "people") return table((data.people ?? []) as Record<string, unknown>[]);
      throw new Error(`Tabla inesperada: ${name}`);
    },
  };
}

describe("searchAnchors", () => {
  it("query vacía devuelve []", async () => {
    const client = makeClient({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await searchAnchors(client as any, "viewer-1", "   ");
    expect(result).toEqual([]);
  });

  it("mezcla biblioteca del viewer (por título) con sagas/personas globales (por nombre)", async () => {
    const client = makeClient({
      passes: [
        { item_type: "book", item_id: "book-dune", user_id: "viewer-1", is_active: true },
        { item_type: "movie", item_id: "movie-other", user_id: "viewer-1", is_active: true },
      ],
      books: [
        { id: "book-dune", title: "Dune", author: "Frank Herbert", cover_url: "dune.jpg" },
        { id: "book-other", title: "Otra cosa", author: null, cover_url: null },
      ],
      movies: [{ id: "movie-other", title: "No coincide", cover_url: null }],
      sagas: [{ id: "saga-dune", name: "Dune Saga", cover_url: null }],
      people: [{ id: "person-dune", name: "Denis Villeneuve", cover_url: null } as never],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await searchAnchors(client as any, "viewer-1", "dun");

    // "book-other" no está en la biblioteca del viewer (no viene de `passes`),
    // así que aunque exista en `books` no debe aparecer.
    expect(result.map((r) => r.id)).not.toContain("book-other");
    // "movie-other" está en la biblioteca pero su título no casa con "dun".
    expect(result.map((r) => r.id)).not.toContain("movie-other");

    const dune = result.find((r) => r.id === "book-dune");
    expect(dune).toEqual({
      type: "book",
      id: "book-dune",
      title: "Dune",
      imageUrl: "dune.jpg",
      subtitle: "Frank Herbert",
    });

    const saga = result.find((r) => r.id === "saga-dune");
    expect(saga?.type).toBe("saga");

    // Cada resultado resuelve un href sin lanzar.
    for (const anchor of result) {
      expect(() => anchorHref(anchor.type, anchor.id)).not.toThrow();
    }

    // Items de biblioteca primero.
    expect(result[0].type).not.toBe("saga");
    expect(result[0].type).not.toBe("person");
  });

  it("acota a un máximo de ~8 resultados", async () => {
    const sagas = Array.from({ length: 12 }, (_, i) => ({
      id: `saga-${i}`,
      name: `Saga Mate ${i}`,
      cover_url: null,
    }));
    const client = makeClient({ sagas });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await searchAnchors(client as any, "viewer-1", "saga mate");
    expect(result.length).toBeLessThanOrEqual(8);
  });
});
