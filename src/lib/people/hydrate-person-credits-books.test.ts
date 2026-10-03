import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

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
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));

import { hydratePersonCredits } from "./hydrate-person-credits";
import { findOrCreateCatalogItemsBulk } from "@/lib/catalog/find-or-create";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

beforeEach(() => {
  vi.mocked(createServiceRoleClient).mockReset();
  vi.mocked(findOrCreateCatalogItemsBulk).mockReset().mockResolvedValue(
    new Map([["book:/works/OL1W", "catalogo-1"]]),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type CreditInsert = Database["public"]["Tables"]["credits"]["Insert"];
type WriterError = { code: string; message: string };

const author = {
  id: "persona-1",
  name: "Suzanne Collins",
  tmdbId: null,
  openlibraryKey: "OL1394359A",
  creditsHydratedAt: null,
};
const expectedCredit = {
  item_type: "book",
  item_id: "catalogo-1",
  person_id: "persona-1",
  role: "author",
  character: null,
  billing_order: null,
};

// El catálogo es el borde mockeado de la primera fase; las escrituras
// posteriores pertenecen a service_role. El estado empieza vacío y solo
// cambia al consumir las operaciones reales de hydratePersonCredits.
function makeIsolatedClients(options: {
  creditsError?: WriterError | null;
  markError?: WriterError | null;
} = {}) {
  const credits: Array<CreditInsert & { billing_order: number | null }> = [];
  const marks = new Map<string, string | null>([[author.id, null], ["otra-persona", null]]);
  const upsert = vi.fn(async (rows: CreditInsert[]) => {
    if (options.creditsError) return { error: options.creditsError };
    for (const row of rows) {
      const existing = credits.some((candidate) =>
        candidate.item_type === row.item_type && candidate.item_id === row.item_id &&
        candidate.person_id === row.person_id && candidate.role === row.role,
      );
      if (!existing) credits.push({ ...row, billing_order: row.billing_order ?? null });
    }
    return { error: null };
  });
  const update = vi.fn((patch: { credits_hydrated_at: string }) => ({
    eq: async (column: string, id: string) => {
      if (column !== "id" || !marks.has(id)) throw new Error("persona inesperada en el writer");
      if (options.markError) return { error: options.markError };
      marks.set(id, patch.credits_hydrated_at);
      return { error: null };
    },
  }));
  const serviceFrom = vi.fn((table: string) => {
    if (table === "credits") return { upsert };
    if (table === "people") return { update };
    throw new Error(`tabla inesperada en el writer: ${table}`);
  });
  const requestFrom = vi.fn(() => {
    throw new Error("el cliente de petición no debe escribir en este unitario");
  });
  vi.mocked(createServiceRoleClient).mockReturnValue(
    { from: serviceFrom } as unknown as ReturnType<typeof createServiceRoleClient>,
  );
  return {
    credits, marks, upsert, update, requestFrom,
    supabase: { from: requestFrom } as unknown as Parameters<typeof hydratePersonCredits>[0],
  };
}

function expectHydratedAuthor(clients: ReturnType<typeof makeIsolatedClients>) {
  expect(clients.credits).toEqual([expectedCredit]);
  const stamp = clients.marks.get(author.id);
  expect(stamp).toEqual(expect.any(String));
  expect(Number.isNaN(Date.parse(stamp ?? ""))).toBe(false);
  expect(clients.marks.get("otra-persona")).toBeNull();
  expect(clients.requestFrom).not.toHaveBeenCalled();
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
  it("conserva año/portada/idioma, siembra el crédito sin orden y sella la persona", async () => {
    const fetchMock = stubTwoPasses();
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const clients = makeIsolatedClients();

    await hydratePersonCredits(clients.supabase, author);

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
      // El IDIOMA del título tiene que llegar hasta aquí: es lo que
      // `findOrCreateCatalogItemsBulk` reenvía a `hydrate_books_bulk` para
      // etiquetar `repr_meta`. Si se pierde por el camino, el lote escribe el
      // título con `title_lang: "other"` y una candidata española posterior ya
      // no lo mejora — el título se queda congelado, que es #730 otra vez.
      titleLang: "es",
      year: 2008,
      coverUrl: "https://covers.openlibrary.org/b/id/111-M.jpg",
    });
    expectHydratedAuthor(clients);
    expect(clients.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ item_type: "book", item_id: "catalogo-1", role: "author" })],
      { onConflict: "item_type,item_id,person_id,role", ignoreDuplicates: true },
    );
    const callsAfterHydration = fetchMock.mock.calls.length;
    await hydratePersonCredits(clients.supabase, {
      ...author, creditsHydratedAt: clients.marks.get(author.id) ?? null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterHydration);
    expect(clients.upsert).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("sin clave de Open Library no pide nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const clients = makeIsolatedClients();

    await hydratePersonCredits(clients.supabase, {
      id: "persona-2",
      name: "Alguien",
      tmdbId: null,
      openlibraryKey: null,
      creditsHydratedAt: null,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(findOrCreateCatalogItemsBulk).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(clients.credits).toEqual([]);
    expect(clients.marks.get(author.id)).toBeNull();
  });

  it("si el writer rechaza los créditos, no sella la persona y permite reintentar", async () => {
    const fetchMock = stubTwoPasses();
    vi.stubGlobal("fetch", fetchMock);
    const error = { code: "23503", message: "person foreign key violation" };
    const options = { creditsError: error as WriterError | null };
    const clients = makeIsolatedClients(options);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(hydratePersonCredits(clients.supabase, author)).resolves.toBeUndefined();

    expect(findOrCreateCatalogItemsBulk).toHaveBeenCalledTimes(1);
    expect(clients.credits).toEqual([]);
    expect(clients.marks.get(author.id)).toBeNull();
    expect(clients.update).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("person credits upsert failed", {
      personId: author.id, count: 1, error,
    });

    options.creditsError = null;
    await hydratePersonCredits(clients.supabase, author);
    expectHydratedAuthor(clients);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("si falla el sello conserva los créditos sembrados y puede terminar el siguiente intento", async () => {
    vi.stubGlobal("fetch", stubTwoPasses());
    const error = { code: "42501", message: "people update denied" };
    const options = { markError: error as WriterError | null };
    const clients = makeIsolatedClients(options);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(hydratePersonCredits(clients.supabase, author)).resolves.toBeUndefined();

    expect(clients.credits).toEqual([expectedCredit]);
    expect(clients.marks.get(author.id)).toBeNull();
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("credits_hydrated_at update failed", {
      personId: author.id, error,
    });

    options.markError = null;
    await hydratePersonCredits(clients.supabase, author);
    expectHydratedAuthor(clients);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("sin ids admitidos en catálogo no siembra créditos ni sella la persona", async () => {
    vi.stubGlobal("fetch", stubTwoPasses());
    vi.mocked(findOrCreateCatalogItemsBulk).mockResolvedValueOnce(new Map());
    const clients = makeIsolatedClients();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await hydratePersonCredits(clients.supabase, author);

    expect(findOrCreateCatalogItemsBulk).toHaveBeenCalledTimes(1);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(clients.credits).toEqual([]);
    expect(clients.marks.get(author.id)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
