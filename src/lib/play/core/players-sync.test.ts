import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { runPlayersSync, type PlayPlayerRow } from "./players-sync";
import { __resetDbForTests, listPlayers, putPlayer, type PlayerRecord } from "./db";
import type { MirrorApi } from "./sync";

function player(overrides: Partial<PlayerRecord> & { playerId: string }): PlayerRecord {
  return {
    identity: "uid-1",
    v: 1,
    name: "Ana",
    syncStatus: "synced",
    deletedAt: null,
    ...overrides,
  };
}

function row(overrides: Partial<PlayPlayerRow> & { id: string }): PlayPlayerRow {
  return { name: "Ana", ...overrides };
}

function fakeApi(initialRows: PlayPlayerRow[] = []) {
  const rows = new Map(initialRows.map((r) => [r.id, r]));
  const calls: string[] = [];
  const api: MirrorApi<PlayPlayerRow> = {
    async selectAll() {
      calls.push("selectAll");
      return { rows: [...rows.values()] };
    },
    async upsert(incoming) {
      calls.push("upsert");
      for (const r of incoming) rows.set(r.id, r);
      return { error: false };
    },
    async remove(ids) {
      calls.push("remove");
      for (const id of ids) rows.delete(id);
      return { error: false };
    },
  };
  return { api, rows, calls };
}

beforeEach(async () => {
  await __resetDbForTests();
});

describe("runPlayersSync", () => {
  it("push de pending: sube y marca synced", async () => {
    await putPlayer(player({ playerId: "a", syncStatus: "pending" }));
    const { api, rows } = fakeApi();
    await runPlayersSync("uid-1", api);
    expect(rows.get("a")).toEqual({ id: "a", name: "Ana" });
    expect((await listPlayers("uid-1"))[0].syncStatus).toBe("synced");
  });

  it("rename pendiente: el upsert lleva el nombre nuevo", async () => {
    await putPlayer(player({ playerId: "a", name: "Ana", syncStatus: "synced" }));
    await putPlayer(player({ playerId: "a", name: "Nuevo", syncStatus: "pending" }));
    const { api, rows } = fakeApi([row({ id: "a", name: "Ana" })]);
    await runPlayersSync("uid-1", api);
    expect(rows.get("a")).toEqual({ id: "a", name: "Nuevo" });
    expect((await listPlayers("uid-1"))[0].name).toBe("Nuevo");
    expect((await listPlayers("uid-1"))[0].syncStatus).toBe("synced");
  });

  it("tombstone: borra remoto y local; remove fallido deja el tombstone", async () => {
    await putPlayer(player({ playerId: "a", syncStatus: "synced", deletedAt: 5 }));
    const { api } = fakeApi([row({ id: "a" })]);
    await runPlayersSync("uid-1", api);
    expect(await listPlayers("uid-1")).toEqual([]);

    await putPlayer(player({ playerId: "b", syncStatus: "synced", deletedAt: 5 }));
    const failing = { ...fakeApi([row({ id: "b" })]).api, remove: async () => ({ error: true }) };
    await runPlayersSync("uid-1", failing);
    expect((await listPlayers("uid-1"))[0].deletedAt).toBe(5);
  });

  it("pull: adopta remotos nuevos como synced y borra los synced ausentes", async () => {
    await putPlayer(player({ playerId: "vieja", syncStatus: "synced" }));
    const { api } = fakeApi([row({ id: "nueva", name: "Beto" })]);
    await runPlayersSync("uid-1", api);
    const ids = (await listPlayers("uid-1")).map((r) => r.playerId);
    expect(ids).toEqual(["nueva"]);
    expect((await listPlayers("uid-1"))[0].syncStatus).toBe("synced");
  });

  it("rename hecho DURANTE la pasada no se pisa al marcar synced", async () => {
    await putPlayer(player({ playerId: "a", name: "Original", syncStatus: "pending" }));
    const { api } = fakeApi();
    const racy: MirrorApi<PlayPlayerRow> = {
      ...api,
      async upsert(incoming) {
        const result = await api.upsert(incoming);
        // El usuario renombra el jugador MIENTRAS el upsert está en vuelo (red
        // en curso): el mark-synced posterior relee y compara contra lo
        // empujado -- si difiere, no marca synced (se queda pending para la
        // próxima pasada), y el rename nunca se pierde.
        await putPlayer(player({ playerId: "a", name: "Cambiado", syncStatus: "pending" }));
        return result;
      },
    };
    await runPlayersSync("uid-1", racy);
    const after = (await listPlayers("uid-1")).find((r) => r.playerId === "a");
    expect(after?.name).toBe("Cambiado");
    expect(after?.syncStatus).toBe("pending");
  });

  it("selectAll con error: no toca nada local", async () => {
    await putPlayer(player({ playerId: "a", syncStatus: "pending" }));
    await runPlayersSync("uid-1", { ...fakeApi().api, selectAll: async () => ({ error: true as const }) });
    expect((await listPlayers("uid-1"))[0].syncStatus).toBe("pending");
  });
});
