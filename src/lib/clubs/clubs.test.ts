import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidateClubPages: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateClubPages: mocks.revalidateClubPages,
}));

import { listMyClubs, resolveUsername } from "./clubs";

const CLUB = {
  id: "club-1",
  slug: "privado",
  name: "Club privado",
  description: null,
  cover_url: null,
  visibility: "private" as const,
  owner_id: "otro",
  created_at: "2026-08-01T00:00:00Z",
};

// Registra los filtros que la consulta aplica de verdad, que es justo lo que
// falla aquí: la fila existe en la BD y la query la deja fuera.
type Recorded = { in: Array<[string, unknown]>; eq: Array<[string, unknown]> };

function makeClient(
  memberRows: { status: string; clubs: typeof CLUB | null }[],
  identity: { user_id: string } | null,
  recorded: Recorded,
) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "yo" } } }) },
    from(table: string) {
      const rows =
        table === "club_members"
          ? memberRows
          : table === "club_stats"
            ? [{ club_id: CLUB.id, member_count: 7 }]
            : [];
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          recorded.eq.push([column, value]);
          return builder;
        },
        in(column: string, value: unknown) {
          recorded.in.push([column, value]);
          return builder;
        },
        async maybeSingle() {
          return { data: identity, error: null };
        },
        then(resolve: (value: unknown) => void) {
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
}

describe("listMyClubs", () => {
  beforeEach(() => vi.clearAllMocks());

  // El bug: /clubes solo pedía status='active', así que un club privado al que
  // te habían invitado no aparecía en NINGÚN listado ("Descubrir" solo trae
  // públicos). La única puerta era la notificación de la campana y, pasada de
  // largo, la invitación quedaba inalcanzable.
  it("incluye los clubes con invitación pendiente, no solo los activos", async () => {
    const recorded: Recorded = { in: [], eq: [] };
    mocks.createClient.mockResolvedValue(
      makeClient([{ status: "invited", clubs: CLUB }], null, recorded),
    );

    const clubs = await listMyClubs();

    expect(clubs).toHaveLength(1);
    expect(clubs[0]).toMatchObject({ id: "club-1", viewerStatus: "invited" });
    // Y que el filtro sea de verdad el de la consulta, no un descarte posterior.
    expect(recorded.in).toContainEqual(["status", ["active", "invited"]]);
  });

  it("distingue el club activo del invitado para que /clubes los separe", async () => {
    const recorded: Recorded = { in: [], eq: [] };
    mocks.createClient.mockResolvedValue(
      makeClient(
        [
          { status: "active", clubs: CLUB },
          { status: "invited", clubs: { ...CLUB, id: "club-2", slug: "otro" } },
        ],
        null,
        recorded,
      ),
    );

    const clubs = await listMyClubs();

    expect(clubs.map((c) => c.viewerStatus)).toEqual(["active", "invited"]);
  });
});

describe("resolveUsername", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["  maxteryo  ", "espacios"],
    ["@maxteryo", "arroba"],
    ["MaxterYo", "mayúsculas"],
  ])("resuelve %s (%s) al mismo usuario", async (typed) => {
    const recorded: Recorded = { in: [], eq: [] };
    mocks.createClient.mockResolvedValue(
      makeClient([], { user_id: "u-max" }, recorded),
    );

    expect(await resolveUsername(typed)).toBe("u-max");
    expect(recorded.eq).toContainEqual(["username", "maxteryo"]);
  });

  // No basta con que case: el guion bajo es legal en un username
  // (^[a-z0-9_]{3,30}$) y a la vez COMODÍN de LIKE. Con `ilike`, "test_import"
  // casaría también con "testximport" y el .maybeSingle() reventaría con dos
  // filas. Este test se pone rojo si alguien "mejora" esto a una búsqueda.
  it("compara por igualdad exacta, sin tratar el guion bajo como comodín", async () => {
    const recorded: Recorded = { in: [], eq: [] };
    mocks.createClient.mockResolvedValue(
      makeClient([], { user_id: "u-imp" }, recorded),
    );

    await resolveUsername("test_import");

    expect(recorded.eq).toContainEqual(["username", "test_import"]);
  });

  it("no consulta con la cadena vacía", async () => {
    const recorded: Recorded = { in: [], eq: [] };
    mocks.createClient.mockResolvedValue(makeClient([], null, recorded));

    expect(await resolveUsername("  @ ")).toBeNull();
    expect(recorded.eq).toHaveLength(0);
  });
});
