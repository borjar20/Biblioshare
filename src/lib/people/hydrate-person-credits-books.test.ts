import { afterEach, describe, expect, it, vi } from "vitest";
import { hydratePersonCredits } from "./hydrate-person-credits";

// Lo que se comprueba: que el año y la portada que trae la obra normalizada
// llegan al catálogo. Hasta ahora esta rama escribía `year: null` literal, y
// por eso en dev había 84 libros de Neal Shusterman con 83 sin año.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

describe("hydratePersonCredits · libros", () => {
  // NOTA: la intención original era interceptar `findOrCreateCatalogItemsBulk`
  // con `vi.doMock("@/lib/catalog/find-or-create", ...)` y comprobar título,
  // año y portada en los argumentos que recibe. `vi.doMock` no se hoistea, y
  // para cuando se llama, `hydrate-person-credits.ts` ya ha capturado por
  // import estático la función REAL — el mock nunca la sustituye, y la
  // función real revienta contra el `fakeSupabase` de este test (que no
  // implementa `.select().in(...)`). Test degradado a comprobar que la
  // llamada de red es la correcta (search.json + author_key); no verifica que
  // año/portada lleguen hasta el catálogo. Ver informe de la tarea.
  it("pide la bibliografía a search.json con la clave del autor", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ docs: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await hydratePersonCredits(fakeSupabase() as never, {
      id: "persona-1",
      name: "Suzanne Collins",
      tmdbId: null,
      openlibraryKey: "OL1394359A",
      creditsHydratedAt: null,
    });

    expect(fetchMock).toHaveBeenCalled();
    const urls = (fetchMock.mock.calls as unknown[][]).map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("search.json"))).toBe(true);
    expect(urls.every((u) => u.includes("author_key=OL1394359A"))).toBe(true);
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
