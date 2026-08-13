import { afterEach, describe, expect, it, vi } from "vitest";

// Lo que se comprueba: que el año y la portada que trae la obra normalizada
// llegan al catálogo. Hasta ahora esta rama escribía `year: null` literal, y
// por eso en dev había 84 libros de Neal Shusterman con 83 sin año.
//
// El intento anterior interceptaba `findOrCreateCatalogItemsBulk` con
// `vi.doMock`, que NO se hoistea: para cuando se ejecuta, el import estático
// de `hydrate-person-credits.ts:5` ya había capturado la función REAL, y esa
// función real reventaba contra el `fakeSupabase` de este test (que no
// implementa `.select().in(...)`). `vi.mock` sí se hoistea — se sustituye el
// módulo antes de que nada lo importe — y es el patrón que ya usan otros 18
// test files de este repo para mockear imports con alias `@/` bajo el mismo
// vitest.config.ts (ver `src/lib/people/get-item-credits.test.ts`).
vi.mock("@/lib/catalog/find-or-create", () => ({
  findOrCreateCatalogItemsBulk: vi.fn(async () => new Map([["book:/works/OL1W", "catalogo-1"]])),
}));

import { hydratePersonCredits } from "./hydrate-person-credits";
import { findOrCreateCatalogItemsBulk } from "@/lib/catalog/find-or-create";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(findOrCreateCatalogItemsBulk).mockClear();
});

function fakeSupabase() {
  return {
    from() {
      return {
        select() {
          return { eq: () => ({ data: [], error: null }) };
        },
        upsert: async () => ({ error: null }),
        update() {
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

// Fixture con la misma forma que usa `author-books.test.ts`: una sola obra
// cuya pasada española trae el título traducido, año de primera publicación y
// portada.
function stubTwoPasses() {
  const esDoc = {
    key: "/works/OL1W",
    title: "The Hunger Games",
    language: ["spa", "eng"],
    first_publish_year: 2008,
    cover_i: 111,
    editions: { docs: [{ title: "Los juegos del hambre", language: ["spa"] }] },
  };
  const enDoc = {
    ...esDoc,
    editions: { docs: [{ title: "The Hunger Games", language: ["eng"] }] },
  };

  return vi.fn(async (input: unknown) => {
    const url = String(input);
    const docs = url.includes("lang=es") ? [esDoc] : [enDoc];
    return { ok: true, json: async () => ({ docs }) };
  });
}

describe("hydratePersonCredits · libros", () => {
  it("pide la bibliografía a search.json y pasa año/portada a findOrCreateCatalogItemsBulk", async () => {
    const fetchMock = stubTwoPasses();
    vi.stubGlobal("fetch", fetchMock);

    await hydratePersonCredits(fakeSupabase() as never, {
      id: "persona-1",
      name: "Suzanne Collins",
      tmdbId: null,
      openlibraryKey: "OL1394359A",
      creditsHydratedAt: null,
    });

    expect(fetchMock).toHaveBeenCalled();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("search.json"))).toBe(true);
    expect(urls.every((u) => u.includes("author_key=OL1394359A"))).toBe(true);

    expect(findOrCreateCatalogItemsBulk).toHaveBeenCalled();
    const resultados = vi.mocked(findOrCreateCatalogItemsBulk).mock.calls[0][1];
    expect(resultados[0]).toMatchObject({
      itemType: "book",
      externalId: "/works/OL1W",
      title: "Los juegos del hambre",
      year: 2008,
      coverUrl: "https://covers.openlibrary.org/b/id/111-M.jpg",
    });
  });

  it("sin clave de Open Library no pide nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await hydratePersonCredits(fakeSupabase() as never, {
      id: "persona-2",
      name: "Alguien",
      tmdbId: null,
      openlibraryKey: null,
      creditsHydratedAt: null,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
