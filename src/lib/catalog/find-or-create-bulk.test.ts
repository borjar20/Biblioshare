import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "./types";

// La hidratación de LIBROS en lote va con `service_role` a propósito, no con el
// cliente de la petición: el trigger `trg_stamp_books_repr_manual` distingue
// curación de automatismo por la ausencia de `app.hydrating`, así que un
// escritor masivo con el cliente del usuario marcaría `manual` el catálogo
// entero. Por eso el mock del cliente de servicio es SEPARADO del `supabase`
// que recibe la función: los tests comprueban por cuál de los dos sale cada
// RPC, que es justo lo que una mutación rompería en silencio (#871).
const mocks = vi.hoisted(() => ({ serviceRpc: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ rpc: mocks.serviceRpc }),
}));

import { findOrCreateCatalogItem, findOrCreateCatalogItemsBulk } from "./find-or-create";

beforeEach(() => {
  mocks.serviceRpc.mockReset();
  mocks.serviceRpc.mockResolvedValue({ data: null, error: null });
});

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

function book(
  externalId: string,
  title: string,
  extra: Partial<SearchResult> = {}
): SearchResult {
  return {
    itemType: "book",
    externalId,
    title,
    subtitle: "Autora",
    coverUrl: null,
    year: null,
    synopsis: null,
    genres: null,
    ...extra,
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

  // 61 de los 268 libros del catálogo de PROD eran shells vacías el 2026-08-26
  // («Sin título», sin año), todas de una sola visita a la ficha de Sanderson,
  // porque esta rama tiraba el título/año/portada que la bibliografía SÍ trae.
  it("libros: hidrata en lote con los datos de la bibliografía, y por service_role", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [
        { external_id: "/works/OL1W", id: "book-1" },
        { external_id: "/works/OL2W", id: "book-2" },
      ],
      error: null,
    });
    const supabase = { rpc } as never;

    const map = await findOrCreateCatalogItemsBulk(supabase, [
      book("/works/OL1W", "En llamas", {
        titleLang: "es",
        coverUrl: "https://covers/1.jpg",
        year: 2009,
      }),
      book("/works/OL2W", "Mockingjay", { titleLang: "en", coverUrl: null, year: 2010 }),
    ]);

    expect(map.get("book:/works/OL1W")).toBe("book-1");
    // El cliente de la PETICIÓN solo registra las shells: ni un hydrate.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("register_catalog_items_bulk");
    // La hidratación sale por el cliente de SERVICIO.
    expect(mocks.serviceRpc).toHaveBeenCalledTimes(1);
    expect(mocks.serviceRpc.mock.calls[0][0]).toBe("hydrate_books_bulk");
    expect(mocks.serviceRpc.mock.calls[0][1]).toEqual({
      p_rows: [
        {
          book_id: "book-1",
          title: "En llamas",
          title_lang: "es",
          author: "Autora",
          cover_url: "https://covers/1.jpg",
          cover_lang: "other",
          published_year: 2009,
        },
        {
          book_id: "book-2",
          title: "Mockingjay",
          title_lang: "en",
          author: "Autora",
          cover_url: null,
          cover_lang: "other",
          published_year: 2010,
        },
      ],
    });
  });

  // Sin `titleLang` no se puede etiquetar `repr_meta`, y un título sin etiqueta
  // que la RPC diera por bueno quedaría CONGELADO (#730). "other" es rango 2:
  // rellena hueco, nunca sella. Cae aquí el catálogo local y el modo mock.
  it("libros sin titleLang: cae a 'other', que rellena hueco pero no sella rango", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{ external_id: "/works/OL9W", id: "book-9" }],
      error: null,
    });

    await findOrCreateCatalogItemsBulk({ rpc } as never, [book("/works/OL9W", "Sin idioma")]);

    expect(mocks.serviceRpc.mock.calls[0][1].p_rows[0].title_lang).toBe("other");
  });

  it("libros: si el register no resolvió el id, esa fila no viaja a la RPC", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{ external_id: "/works/OL1W", id: "book-1" }],
      error: null,
    });

    await findOrCreateCatalogItemsBulk({ rpc } as never, [
      book("/works/OL1W", "Sí"),
      book("/works/OL404W", "No resuelto"),
    ]);

    expect(mocks.serviceRpc.mock.calls[0][1].p_rows).toHaveLength(1);
    expect(mocks.serviceRpc.mock.calls[0][1].p_rows[0].book_id).toBe("book-1");
  });

  it("libros: hydrate_books_bulk falla -> el map se conserva, no lanza", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{ external_id: "/works/OL1W", id: "book-1" }],
      error: null,
    });
    mocks.serviceRpc.mockRejectedValueOnce(new Error("42501"));

    const map = await findOrCreateCatalogItemsBulk({ rpc } as never, [
      book("/works/OL1W", "Libro"),
    ]);

    expect(map.get("book:/works/OL1W")).toBe("book-1");
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
