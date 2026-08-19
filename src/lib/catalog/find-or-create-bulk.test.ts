import { describe, expect, it, vi } from "vitest";
import { findOrCreateCatalogItem, findOrCreateCatalogItemsBulk } from "./find-or-create";
import type { SearchResult } from "./types";

function movie(externalId: string, title: string, extra: Partial<SearchResult> = {}): SearchResult {
  return {
    itemType: "movie",
    externalId,
    title,
    originalTitle: null,
    subtitle: null,
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
    ...extra,
  } as SearchResult;
}

function book(externalId: string, title: string): SearchResult {
  return {
    itemType: "book",
    externalId,
    title,
    subtitle: "Autora",
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
  } as SearchResult;
}

describe("findOrCreateCatalogItemsBulk", () => {
  it("lote vacío -> mapa vacío, sin llamar a rpc", async () => {
    const rpc = vi.fn();
    const supabase = { rpc } as never;

    const map = await findOrCreateCatalogItemsBulk(supabase, []);

    expect(map.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("crea shells en lote e hidrata con los datos en mano", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ external_id: "129", id: "m1" }], error: null }) // register bulk
      .mockResolvedValueOnce({ data: null, error: null }); // hydrate bulk
    const supabase = { rpc } as never;

    const map = await findOrCreateCatalogItemsBulk(supabase, [
      movie("129", "T", { coverUrl: "c", year: 2001, synopsis: "S", genres: ["g"] }),
    ]);

    expect(map.get("movie:129")).toBe("m1");
    expect(rpc).toHaveBeenNthCalledWith(1, "register_catalog_items_bulk", {
      p_item_type: "movie",
      p_external_ids: ["129"],
    });
    expect(rpc.mock.calls[1][0]).toBe("hydrate_screens_bulk");
    expect(rpc.mock.calls[1][1]).toEqual({
      p_item_type: "movie",
      p_rows: [
        {
          item_id: "m1",
          title: "T",
          original_title: null,
          synopsis: "S",
          genres: ["g"],
          release_year: 2001,
          cover_url: "c",
        },
      ],
    });
  });

  it("deduplica externalId repetidos antes de llamar a register_catalog_items_bulk", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ external_id: "9", id: "uuid-9" }], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const supabase = { rpc } as never;

    await findOrCreateCatalogItemsBulk(supabase, [movie("9", "Repe"), movie("9", "Repe")]);

    expect(rpc).toHaveBeenNthCalledWith(1, "register_catalog_items_bulk", {
      p_item_type: "movie",
      p_external_ids: ["9"],
    });
  });

  it("libros: registra la shell pero NO hidrata (la ficha de libro lo hace)", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{ external_id: "/works/OL1W", id: "book-1" }],
      error: null,
    });
    const supabase = { rpc } as never;

    const map = await findOrCreateCatalogItemsBulk(supabase, [book("/works/OL1W", "Libro")]);

    expect(map.get("book:/works/OL1W")).toBe("book-1");
    expect(rpc).toHaveBeenCalledTimes(1); // solo el register, ningún hydrate_screens_bulk
  });

  it("sin sesión: register_catalog_items_bulk lanza (raise exception) -> se traga, no lanza", async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error("authentication required"));
    const supabase = { rpc } as never;

    const map = await findOrCreateCatalogItemsBulk(supabase, [movie("1", "A")]);

    expect(map.size).toBe(0);
  });

  it("hydrate_screens_bulk falla -> el map ya resuelto se conserva, no lanza", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ external_id: "1", id: "uuid-1" }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const supabase = { rpc } as never;

    const map = await findOrCreateCatalogItemsBulk(supabase, [movie("1", "A")]);

    expect(map.get("movie:1")).toBe("uuid-1");
  });

  it("externalId no devuelto por el register -> no llama a hydrate_screens_bulk", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null }); // register no resolvió nada
    const supabase = { rpc } as never;

    const map = await findOrCreateCatalogItemsBulk(supabase, [movie("404", "Missing")]);

    expect(map.size).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
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
