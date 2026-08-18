import { describe, expect, it, vi } from "vitest";
import { findOrCreateCatalogItem, findOrCreateCatalogItemsBulk } from "./find-or-create";
import type { SearchResult } from "./types";

function movie(externalId: string, title: string): SearchResult {
  return {
    itemType: "movie",
    externalId,
    title,
    subtitle: null,
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
  } as SearchResult;
}

/**
 * Doble mínimo del cliente de Supabase para el camino del lote:
 * `.from(t).select(c).in(col, ids)` y `.from(t).insert(rows).select(c)`.
 * `existing` son las filas que ya están; `inserted`, las que devuelve el insert.
 */
function fakeSupabase(opts: {
  existing: Array<{ id: string; tmdb_id: number }>;
  inserted?: Array<{ id: string; tmdb_id: number }>;
  insertError?: { code: string } | null;
}) {
  const selectCalls: unknown[] = [];
  const insertCalls: unknown[][] = [];

  return {
    from() {
      return {
        select() {
          return {
            in(_col: string, ids: unknown[]) {
              selectCalls.push(ids);
              return Promise.resolve({ data: opts.existing, error: null });
            },
          };
        },
        insert(rows: unknown[]) {
          insertCalls.push(rows);
          return {
            select() {
              return Promise.resolve({
                data: opts.insertError ? null : (opts.inserted ?? []),
                error: opts.insertError ?? null,
              });
            },
          };
        },
      };
    },
    _selectCalls: selectCalls,
    _insertCalls: insertCalls,
  };
}

describe("findOrCreateCatalogItemsBulk", () => {
  it("lote vacío -> mapa vacío, sin tocar la base", async () => {
    const supabase = fakeSupabase({ existing: [] });
    const map = await findOrCreateCatalogItemsBulk(supabase as never, []);
    expect(map.size).toBe(0);
    expect(supabase._selectCalls).toHaveLength(0);
  });

  it("todos existentes -> un solo select, ningún insert", async () => {
    const supabase = fakeSupabase({ existing: [{ id: "uuid-1", tmdb_id: 1 }] });

    const map = await findOrCreateCatalogItemsBulk(supabase as never, [movie("1", "A")]);

    expect(map.get("movie:1")).toBe("uuid-1");
    expect(supabase._selectCalls).toHaveLength(1);
    expect(supabase._insertCalls).toHaveLength(0);
  });

  it("lote mixto -> inserta SOLO los que faltan, en UNA llamada", async () => {
    const supabase = fakeSupabase({
      existing: [{ id: "uuid-1", tmdb_id: 1 }],
      inserted: [
        { id: "uuid-2", tmdb_id: 2 },
        { id: "uuid-3", tmdb_id: 3 },
      ],
    });

    const map = await findOrCreateCatalogItemsBulk(supabase as never, [
      movie("1", "A"),
      movie("2", "B"),
      movie("3", "C"),
    ]);

    expect(supabase._insertCalls).toHaveLength(1);
    expect(supabase._insertCalls[0]).toHaveLength(2);
    expect([...map.entries()].sort()).toEqual([
      ["movie:1", "uuid-1"],
      ["movie:2", "uuid-2"],
      ["movie:3", "uuid-3"],
    ]);
  });

  it("deduplica externalId repetidos antes de insertar", async () => {
    const supabase = fakeSupabase({
      existing: [],
      inserted: [{ id: "uuid-9", tmdb_id: 9 }],
    });

    await findOrCreateCatalogItemsBulk(supabase as never, [
      movie("9", "Repe"),
      movie("9", "Repe"),
    ]);

    expect(supabase._insertCalls[0]).toHaveLength(1);
  });

  it("42501 (anónimo sin grant) -> devuelve solo los existentes, sin lanzar", async () => {
    const supabase = fakeSupabase({
      existing: [{ id: "uuid-1", tmdb_id: 1 }],
      insertError: { code: "42501" },
    });

    const map = await findOrCreateCatalogItemsBulk(supabase as never, [
      movie("1", "A"),
      movie("2", "B"),
    ]);

    expect(map.get("movie:1")).toBe("uuid-1");
    expect(map.has("movie:2")).toBe(false);
  });

  it("23505 (carrera) -> re-selecciona y recupera los ids", async () => {
    // El segundo select ya ve la fila que insertó la otra petición.
    let selectCount = 0;
    const supabase = {
      from() {
        return {
          select() {
            return {
              in() {
                selectCount += 1;
                return Promise.resolve({
                  data: selectCount === 1 ? [] : [{ id: "uuid-carrera", tmdb_id: 5 }],
                  error: null,
                });
              },
            };
          },
          insert() {
            return {
              select() {
                return Promise.resolve({ data: null, error: { code: "23505" } });
              },
            };
          },
        };
      },
    };

    const map = await findOrCreateCatalogItemsBulk(supabase as never, [movie("5", "Carrera")]);

    expect(map.get("movie:5")).toBe("uuid-carrera");
    expect(selectCount).toBe(2);
  });
});

describe("findOrCreateCatalogItem", () => {
  it("crea la shell por RPC y NO manda campos canónicos", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "movie-id-1", error: null });
    const supabase = { rpc } as never;
    const id = await findOrCreateCatalogItem(
      supabase,
      {
        itemType: "movie",
        externalId: "129",
        title: "FAKE",
        subtitle: null,
        coverUrl: null,
        year: 2001,
        synopsis: "x",
        genres: ["g"],
      } as never,
      "user-1"
    );
    expect(id).toBe("movie-id-1");
    expect(rpc).toHaveBeenCalledWith("register_catalog_item", {
      p_item_type: "movie",
      p_external_id: "129",
    });
  });
});
