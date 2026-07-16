import { describe, expect, it, vi, beforeEach } from "vitest";

// Mocks hoisted por vitest: el módulo real de manage-actions importa
// next/navigation, @/lib/supabase/server y @/lib/reactivity/revalidate, y
// los tres tienen efectos secundarios (redirect real, cookies(), Next
// router) que no queremos en un test unitario.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateReadingLog: vi.fn(),
  revalidateLibrary: vi.fn(),
}));

// Fake DB en memoria que reproduce el trozo relevante del esquema real:
//   - passes: filas borrables por (user_id, item_type, item_id).
//   - episode_watches: FK pass_id ON DELETE SET NULL (20260717_pass_hub_b3) +
//     único parcial (user_id, series_id, season_number, episode_number)
//     WHERE pass_id IS NULL (episode_watches_legacy_unique,
//     20260717_pass_hub_b2). Si un DELETE de passes deja dos filas de
//     episode_watches con el mismo (user, series, season, episode) y
//     pass_id a null a la vez, la BD real dispara 23505 — este fake lo
//     replica para que el test sea un regression test de verdad, no solo
//     una comprobación de qué se llamó.
type PassRow = { id: string; user_id: string; item_type: string; item_id: string };
type WatchRow = {
  user_id: string;
  series_id: string;
  season_number: number;
  episode_number: number;
  pass_id: string | null;
};

function makeFakeSupabase(state: { passes: PassRow[]; watches: WatchRow[] }) {
  function deleteBuilder(execute: (filters: Record<string, unknown>) => { error: unknown }) {
    const filters: Record<string, unknown> = {};
    const builder = {
      eq(col: string, val: unknown) {
        filters[col] = val;
        return builder;
      },
      then(resolve: (v: { error: unknown }) => void, reject: (e: unknown) => void) {
        try {
          resolve(execute(filters));
        } catch (e) {
          reject(e);
        }
      },
    };
    return builder;
  }

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    from(table: string) {
      if (table === "passes") {
        return {
          delete: () =>
            deleteBuilder((filters) => {
              const toDelete = state.passes.filter(
                (p) =>
                  p.user_id === filters.user_id &&
                  p.item_type === filters.item_type &&
                  p.item_id === filters.item_id
              );
              const deleteIds = new Set(toDelete.map((p) => p.id));
              state.passes = state.passes.filter((p) => !deleteIds.has(p.id));

              // ON DELETE SET NULL de la FK real.
              for (const w of state.watches) {
                if (w.pass_id && deleteIds.has(w.pass_id)) w.pass_id = null;
              }

              // Único parcial "legacy": (user_id, series_id, season, episode)
              // WHERE pass_id IS NULL.
              const seen = new Set<string>();
              for (const w of state.watches) {
                if (w.pass_id !== null) continue;
                const key = `${w.user_id}|${w.series_id}|${w.season_number}|${w.episode_number}`;
                if (seen.has(key)) {
                  return {
                    error: {
                      code: "23505",
                      message:
                        'duplicate key value violates unique constraint "episode_watches_legacy_unique"',
                    },
                  };
                }
                seen.add(key);
              }
              return { error: null };
            }),
        };
      }
      if (table === "episode_watches") {
        return {
          delete: () =>
            deleteBuilder((filters) => {
              state.watches = state.watches.filter(
                (w) => !(w.user_id === filters.user_id && w.series_id === filters.series_id)
              );
              return { error: null };
            }),
        };
      }
      throw new Error(`tabla no soportada por el fake: ${table}`);
    },
  };
}

let dbState: { passes: PassRow[]; watches: WatchRow[] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeFakeSupabase(dbState),
}));

describe("removeFromLibrary", () => {
  beforeEach(() => {
    vi.resetModules();
    dbState = { passes: [], watches: [] };
  });

  // Hallazgo de revisión (whole-branch review, Tarea 12): una serie
  // REVISIONADA tiene el mismo episodio marcado bajo dos pass_id distintos
  // (episode_watches_once_per_pass lo permite). Antes del fix,
  // removeFromLibrary solo borraba `passes`; el FK set null desenganchaba
  // ambas filas a la vez y colisionaban en episode_watches_legacy_unique
  // (23505), abortando el DELETE entero — el usuario no podía quitar la
  // serie de su biblioteca.
  it("borra una serie revisionada (mismo episodio en dos pases) sin 23505, y no deja episode_watches huérfanos", async () => {
    const { removeFromLibrary } = await import("./manage-actions");

    dbState.passes = [
      { id: "pass-1", user_id: "user-1", item_type: "series", item_id: "series-1" },
      { id: "pass-2", user_id: "user-1", item_type: "series", item_id: "series-1" },
    ];
    dbState.watches = [
      {
        user_id: "user-1",
        series_id: "series-1",
        season_number: 1,
        episode_number: 1,
        pass_id: "pass-1",
      },
      {
        user_id: "user-1",
        series_id: "series-1",
        season_number: 1,
        episode_number: 1,
        pass_id: "pass-2",
      },
    ];

    await expect(removeFromLibrary("series", "series-1")).resolves.toBeUndefined();

    expect(dbState.passes).toHaveLength(0);
    expect(dbState.watches.filter((w) => w.series_id === "series-1")).toHaveLength(0);
  });

  it("libro: borra los pases sin tocar episode_watches (no aplica)", async () => {
    const { removeFromLibrary } = await import("./manage-actions");

    dbState.passes = [
      { id: "pass-1", user_id: "user-1", item_type: "book", item_id: "book-1" },
    ];

    await expect(removeFromLibrary("book", "book-1")).resolves.toBeUndefined();
    expect(dbState.passes).toHaveLength(0);
  });
});
