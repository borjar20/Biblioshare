import { describe, expect, it, vi } from "vitest";
import { filterUnblockedUserIds, getBlockState, usersAreBlocked } from "./block-state";

type BlockRow = { blocker_id: string; blocked_id: string };

function makeFakeSupabase(rows: BlockRow[]) {
  const rpc = vi.fn(async (name: string, args: { candidate_ids?: string[]; other_user_id?: string }) => {
    const viewerId = "viewer";
    if (name === "users_are_blocked") {
      const otherId = args.other_user_id;
      return {
        data: rows.some(
          (row) =>
            (row.blocker_id === viewerId && row.blocked_id === otherId) ||
            (row.blocker_id === otherId && row.blocked_id === viewerId),
        ),
        error: null,
      };
    }
    expect(name).toBe("filter_unblocked_user_ids");
    const blocked = new Set(
      rows
        .filter((row) => row.blocker_id === viewerId || row.blocked_id === viewerId)
        .map((row) => (row.blocker_id === viewerId ? row.blocked_id : row.blocker_id)),
    );
    return { data: (args.candidate_ids ?? []).filter((id) => !blocked.has(id)), error: null };
  });

  return {
    from(table: string) {
      expect(table).toBe("user_blocks");
      const builder = {
        select() {
          return builder;
        },
        or() {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
    rpc,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getBlockState", () => {
  it("devuelve none para uno mismo sin consultar la tabla", async () => {
    const supabase = makeFakeSupabase([]);
    await expect(getBlockState(supabase, "viewer", "viewer")).resolves.toBe("none");
  });

  it("distingue un bloqueo creado por el viewer", async () => {
    const supabase = makeFakeSupabase([{ blocker_id: "viewer", blocked_id: "target" }]);
    await expect(getBlockState(supabase, "viewer", "target")).resolves.toBe("blocked");
  });

  it("distingue un bloqueo recibido", async () => {
    const supabase = makeFakeSupabase([{ blocker_id: "target", blocked_id: "viewer" }]);
    await expect(getBlockState(supabase, "viewer", "target")).resolves.toBe("blocked_by");
  });

  it("devuelve none cuando no existe relación", async () => {
    const supabase = makeFakeSupabase([]);
    await expect(getBlockState(supabase, "viewer", "target")).resolves.toBe("none");
  });
});

describe("usersAreBlocked", () => {
  it("detecta cualquiera de las dos direcciones", async () => {
    await expect(
      usersAreBlocked(
        makeFakeSupabase([{ blocker_id: "target", blocked_id: "viewer" }]),
        "target",
      ),
    ).resolves.toBe(true);
  });

  it("devuelve false si no hay relación", async () => {
    await expect(usersAreBlocked(makeFakeSupabase([]), "target")).resolves.toBe(false);
  });
});

describe("filterUnblockedUserIds", () => {
  it("deduplica y elimina bloqueos en cualquiera de las dos direcciones", async () => {
    const supabase = makeFakeSupabase([
      { blocker_id: "viewer", blocked_id: "blocked" },
      { blocker_id: "blocked-by", blocked_id: "viewer" },
    ]);

    await expect(
      filterUnblockedUserIds(supabase, ["ok", "blocked", "blocked-by", "ok"]),
    ).resolves.toEqual(["ok"]);
  });

  it("no llama a la RPC para un lote vacío", async () => {
    const supabase = makeFakeSupabase([]);
    await expect(filterUnblockedUserIds(supabase, [])).resolves.toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
