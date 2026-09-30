import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  getActivePass: vi.fn(),
  getEditions: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@/lib/passes/get-passes", () => ({ getActivePass: mocks.getActivePass }));
vi.mock("@/lib/editions/get-editions", () => ({ getEditions: mocks.getEditions }));
vi.mock("@/lib/series/get-episode-data", () => ({ getEpisodeData: vi.fn() }));
vi.mock("@/lib/library/ensure-series-episodes", () => ({ ensureSeriesEpisodes: vi.fn() }));

import { loadSessionContext } from "./load-context";

const PASS_ID = "pase-antiguo";
const ACTIVE_PASS_ID = "pase-activo";
const ITEM_ID = "libro-1";

function navigationThatThrows() {
  mocks.notFound.mockImplementation(() => {
    throw new Error("not-found");
  });
  mocks.redirect.mockImplementation((href: string) => {
    throw new Error(`redirect:${href}`);
  });
}

function clientFor(passRow: { id: string; item_type: "book"; item_id: string } | null) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => {
          if (table === "passes") return { data: passRow };
          if (table === "books") {
            return {
              data: {
                title: "Libro", author: "Autora", cover_url: null, total_pages: 300,
              },
            };
          }
          return { data: null };
        },
      };
      return builder;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  navigationThatThrows();
  mocks.createClient.mockResolvedValue(clientFor({
    id: PASS_ID, item_type: "book", item_id: ITEM_ID,
  }));
  mocks.getCurrentUser.mockResolvedValue({ id: "usuario" });
  mocks.getEditions.mockResolvedValue([]);
});

describe("loadSessionContext (#737)", () => {
  it("mantiene el 404 cuando el id no existe o no pertenece al usuario", async () => {
    mocks.createClient.mockResolvedValue(clientFor(null));

    await expect(loadSessionContext("pase-ajeno-o-inexistente")).rejects.toThrow("not-found");
    expect(mocks.getActivePass).not.toHaveBeenCalled();
  });

  it("mantiene el 404 si la obra ya no tiene pase activo", async () => {
    mocks.getActivePass.mockResolvedValue(null);

    await expect(loadSessionContext(PASS_ID)).rejects.toThrow("not-found");
  });

  it("redirige el pase propio archivado a la ficha cuando otra lectura queda activa", async () => {
    mocks.getActivePass.mockResolvedValue({
      id: ACTIVE_PASS_ID, status: "in_progress", position: {}, editionId: null,
    });

    await expect(loadSessionContext(PASS_ID)).rejects.toThrow("redirect:/libro/libro-1");
    expect(mocks.getEditions).not.toHaveBeenCalled();
  });

  it("conserva el camino del formulario cuando el id solicitado sigue activo", async () => {
    mocks.getActivePass.mockResolvedValue({
      id: PASS_ID, status: "in_progress", position: { page: 20 }, editionId: null,
    });

    await expect(loadSessionContext(PASS_ID)).resolves.toMatchObject({
      passId: PASS_ID,
      itemType: "book",
      itemId: ITEM_ID,
      position: { page: 20 },
    });
  });

  it("mantiene el filtro del dueño al cargar el pase", async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const client = clientFor({ id: PASS_ID, item_type: "book", item_id: ITEM_ID }) as {
      from(table: string): { eq(column: string, value: unknown): unknown };
    };
    const originalFrom = client.from;
    client.from = (table: string) => {
      const builder = originalFrom(table);
      const originalEq = builder.eq.bind(builder);
      builder.eq = (column: string, value: unknown) => {
        if (table === "passes") eqCalls.push([column, value]);
        return originalEq(column, value);
      };
      return builder;
    };
    mocks.createClient.mockResolvedValue(client);
    mocks.getActivePass.mockResolvedValue({
      id: PASS_ID, status: "in_progress", position: { page: 20 }, editionId: null,
    });

    await loadSessionContext(PASS_ID);

    expect(eqCalls).toContainEqual(["user_id", "usuario"]);
  });
});
