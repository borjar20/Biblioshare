import { beforeEach, describe, expect, it, vi } from "vitest";

// Doble mínimo de Supabase: cada tabla resuelve a lo que diga `h.tables`, con
// la cadena select/eq/maybeSingle que usa loadClosingContext. Registra los
// filtros para comprobar que solo lee pases propios.
type Result = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Result>,
  eqs: {} as Record<string, Record<string, unknown>>,
  companion: vi.fn(),
}));

function query(table: string) {
  const result = () => h.tables[table] ?? { data: [], error: null };
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      (h.eqs[table] ??= {})[col] = val;
      return q;
    },
    maybeSingle: () => Promise.resolve(result()),
    then: (ok: (r: Result) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, ko),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => query(table),
  }),
}));
vi.mock("@/lib/pet/get-companion-state", () => ({ getCompanionState: h.companion }));

import { loadClosingContext } from "./load-closing-context";

const companion = { name: "Nuez", petClass: "wizard", stage: "adult", mood: "happy", hidden: true };

beforeEach(() => {
  h.tables = {};
  h.eqs = {};
  h.companion.mockReset().mockResolvedValue(companion);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadClosingContext", () => {
  it("libro: sesiones, días, racha y páginas de la posición; mascota aunque esté oculta", async () => {
    h.tables.passes = { data: { item_type: "book", position: { page: 412 } }, error: null };
    h.tables.progress_sessions = {
      data: [{ session_date: "2026-11-01" }, { session_date: "2026-11-02" }, { session_date: "2026-11-05" }],
      error: null,
    };
    const ctx = await loadClosingContext("pass-1");
    expect(ctx.recap).toEqual({ sessions: 3, days: 5, longestStreak: 2, pages: 412, episodes: null });
    expect(ctx.pet).toEqual({ name: "Nuez", petClass: "wizard", stage: "adult" });
    expect(h.eqs.passes).toEqual({ id: "pass-1", user_id: "user-1" });
    expect(h.eqs.progress_sessions).toEqual({ pass_id: "pass-1", user_id: "user-1" });
  });

  it("serie: el recuento sale de los episodios vistos (las series no tienen progress_sessions)", async () => {
    h.tables.passes = { data: { item_type: "series", position: { season: 1, episode: 8 } }, error: null };
    h.tables.progress_sessions = { data: [], error: null };
    h.tables.episode_watches = {
      data: [
        { watched_on: "2026-11-01" },
        { watched_on: "2026-11-01" },
        { watched_on: "2026-11-02" },
        { watched_on: "2026-11-04" },
      ],
      error: null,
    };
    const ctx = await loadClosingContext("pass-1");
    // 4 episodios en 3 días de serie distintos, del 1 al 4 (4 días), racha 2.
    expect(ctx.recap).toEqual({ sessions: 3, days: 4, longestStreak: 2, pages: null, episodes: 4 });
    expect(h.eqs.episode_watches).toEqual({ pass_id: "pass-1", user_id: "user-1" });
  });

  it("serie sin episodios: recuento a cero (la frase cae a la genérica)", async () => {
    h.tables.passes = { data: { item_type: "series", position: {} }, error: null };
    h.tables.episode_watches = { data: [], error: null };
    const ctx = await loadClosingContext("pass-1");
    expect(ctx.recap).toEqual({ sessions: 0, days: 0, longestStreak: 0, pages: null, episodes: 0 });
  });

  it("pase no encontrado (o ajeno): sin recuento", async () => {
    h.tables.passes = { data: null, error: null };
    const ctx = await loadClosingContext("pass-1");
    expect(ctx.recap).toBeNull();
    expect(ctx.pet).not.toBeNull();
  });

  it("si falla la mascota, el recuento sigue y la mascota es null", async () => {
    h.tables.passes = { data: { item_type: "book", position: { page: 10 } }, error: null };
    h.tables.progress_sessions = { data: [{ session_date: "2026-11-01" }], error: null };
    h.companion.mockRejectedValue(new Error("rpc"));
    const ctx = await loadClosingContext("pass-1");
    expect(ctx.pet).toBeNull();
    expect(ctx.recap?.sessions).toBe(1);
  });
});
