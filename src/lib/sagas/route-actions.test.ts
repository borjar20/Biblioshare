import { beforeEach, describe, expect, it, vi } from "vitest";

// Mismo patrón de mocking que src/lib/passes/actions.test.ts: cliente Supabase
// falso por tabla, next/navigation y las utilidades de revalidación mockeadas.
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidateSagaPage: vi.fn(),
  revalidateSagaRoutesPage: vi.fn(),
  getCurrentUserRole: vi.fn(),
  hasMinRole: vi.fn(),
  getSagaRoutes: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateSagaPage: mocks.revalidateSagaPage,
  revalidateSagaRoutesPage: mocks.revalidateSagaRoutesPage,
}));
vi.mock("@/lib/auth/roles", () => ({
  getCurrentUserRole: mocks.getCurrentUserRole,
  hasMinRole: mocks.hasMinRole,
}));
vi.mock("./get-saga-routes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./get-saga-routes")>();
  return { ...actual, getSagaRoutes: mocks.getSagaRoutes };
});

import { adoptRoute, deleteRoute, dropRoute, moveRoute } from "./route-actions";
import type { CuratedRouteRow } from "./get-saga-routes";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasMinRole.mockReturnValue(true);
  mocks.getCurrentUserRole.mockResolvedValue("collaborator");
});

describe("adoptRoute", () => {
  function client(upsertError: unknown) {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => {
        if (table === "saga_route_choices") return { upsert: async () => ({ error: upsertError }) };
        throw new Error(`Tabla inesperada: ${table}`);
      },
    });
  }

  it("upsert correcto: sin error, revalida la ficha", async () => {
    client(null);
    const result = await adoptRoute("saga-1", "guardia");
    expect(result).toEqual({});
    expect(mocks.revalidateSagaPage).toHaveBeenCalledWith("saga-1");
  });

  it("upsert fallido: YA NO SE TRAGA el error — lo devuelve tipado y no revalida", async () => {
    client({ message: "boom" });
    const result = await adoptRoute("saga-1", "guardia");
    expect(result).toEqual({ error: "generic" });
    expect(mocks.revalidateSagaPage).not.toHaveBeenCalled();
  });
});

describe("dropRoute", () => {
  function client(deleteError: unknown) {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => {
        if (table === "saga_route_choices") {
          return { delete: () => ({ eq: () => ({ eq: () => ({ error: deleteError }) }) }) };
        }
        throw new Error(`Tabla inesperada: ${table}`);
      },
    });
  }

  it("borrado correcto: sin error, revalida la ficha", async () => {
    client(null);
    const result = await dropRoute("saga-1");
    expect(result).toEqual({});
    expect(mocks.revalidateSagaPage).toHaveBeenCalledWith("saga-1");
  });

  it("borrado fallido: YA NO SE TRAGA el error — lo devuelve tipado y no revalida", async () => {
    client({ message: "boom" });
    const result = await dropRoute("saga-1");
    expect(result).toEqual({ error: "generic" });
    expect(mocks.revalidateSagaPage).not.toHaveBeenCalled();
  });
});

describe("moveRoute", () => {
  const routes: CuratedRouteRow[] = [
    { id: "r1", slug: "uno", name: "Uno", summary: null, position: 1, isReadingOrder: false },
    { id: "r2", slug: "dos", name: "Dos", summary: null, position: 2, isReadingOrder: false },
  ];

  function client(updateErrorsById: Record<string, unknown>) {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => {
        if (table === "saga_routes") {
          return {
            update: () => ({
              eq: (_col: string, id: string) => ({ error: updateErrorsById[id] ?? null }),
            }),
          };
        }
        throw new Error(`Tabla inesperada: ${table}`);
      },
    });
  }

  it("reordenado correcto: sin error, revalida la ficha", async () => {
    client({});
    mocks.getSagaRoutes.mockResolvedValue(routes);
    const result = await moveRoute("r2", "saga-1", "up");
    expect(result).toEqual({});
    expect(mocks.revalidateSagaPage).toHaveBeenCalledWith("saga-1");
  });

  it("routeId no encontrado o ya en el extremo: no hay nada que escribir, sin error", async () => {
    client({});
    mocks.getSagaRoutes.mockResolvedValue(routes);
    const result = await moveRoute("r1", "saga-1", "up");
    expect(result).toEqual({});
    expect(mocks.revalidateSagaPage).not.toHaveBeenCalled();
  });

  it("un update fallido: YA NO SE TRAGA el error — lo devuelve tipado y no revalida", async () => {
    client({ r1: { message: "boom" } });
    mocks.getSagaRoutes.mockResolvedValue(routes);
    const result = await moveRoute("r2", "saga-1", "up");
    expect(result).toEqual({ error: "generic" });
    expect(mocks.revalidateSagaPage).not.toHaveBeenCalled();
  });
});

describe("deleteRoute", () => {
  function client({ data, error }: { data: Array<{ id: string }> | null; error: unknown }) {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: (table: string) => {
        if (table === "saga_routes") {
          return {
            delete: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({ data, error }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Tabla inesperada: ${table}`);
      },
    });
  }

  it("borrado correcto: fila afectada, revalida", async () => {
    client({ data: [{ id: "r1" }], error: null });
    const result = await deleteRoute("r1", "saga-1");
    expect(result).toEqual({});
    expect(mocks.revalidateSagaPage).toHaveBeenCalledWith("saga-1");
  });

  it("routeId inexistente o de otra saga: 0 filas borradas → notFound, no genérico", async () => {
    client({ data: [], error: null });
    const result = await deleteRoute("otra-ruta", "saga-1");
    expect(result).toEqual({ error: "notFound" });
    expect(mocks.revalidateSagaPage).not.toHaveBeenCalled();
  });

  it("error real de la base de datos → generic", async () => {
    client({ data: null, error: { message: "boom" } });
    const result = await deleteRoute("r1", "saga-1");
    expect(result).toEqual({ error: "generic" });
    expect(mocks.revalidateSagaPage).not.toHaveBeenCalled();
  });
});
