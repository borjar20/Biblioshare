import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  planSync,
  rowFromRecord,
  recordFromRow,
  runSavedSync,
  type PlayGameRow,
  type PlayGamesApi,
} from "./sync";
import { __resetDbForTests, deleteSaved, listSaved, saveFinished, type SavedGameRecord } from "./db";
import { makeEvent } from "./events";
import { replay } from "./replay";
import { buildSavedSummary } from "../tools";
import type { PlayEvent } from "./types";
import type { ScoreSetup } from "../score/types";

// Log mínimo válido (game_started + round_scored + game_finished, herramienta
// "score") para que buildSavedSummary/replay no revienten -- mismo patrón que
// tools.test.ts y db.test.ts.
const scoreSetup: ScoreSetup = {
  participants: [
    { id: "ana", kind: "user", name: "Ana", userId: "user-ana-1" },
    { id: "beto", kind: "guest", name: "Beto" },
  ],
  direction: "highest",
};

function scoreLog(gameId: string): PlayEvent[] {
  return [
    makeEvent("game_started", { toolId: "score" as const, setup: scoreSetup }, 1000, gameId),
    makeEvent("round_scored", { scores: [5, 3] }, 1500),
    makeEvent("game_finished", { reason: "manual" as const }, 2000),
  ];
}

function rec(overrides: Partial<SavedGameRecord> & { gameId: string }): SavedGameRecord {
  const committed = scoreLog(overrides.gameId);
  return {
    identity: "anon",
    v: 2,
    committed,
    savedAt: 3000,
    summary: buildSavedSummary(replay(committed)),
    syncStatus: "synced",
    deletedAt: null,
    ...overrides,
  };
}

function row(overrides: Partial<PlayGameRow> & { id: string }): PlayGameRow {
  return { ...rowFromRecord(rec({ gameId: overrides.id })), ...overrides };
}

beforeEach(async () => {
  await __resetDbForTests();
});

describe("planSync", () => {
  it("pending sin remoto → push", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "pending" })], []);
    expect(plan.push.map((r) => r.gameId)).toEqual(["a"]);
    expect(plan.adoptLocal).toEqual([]);
  });

  it("pending CON remoto → push igualmente, y el remoto NO se adopta (jamás pisar un pending)", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "pending" })], [row({ id: "a" })]);
    expect(plan.push.map((r) => r.gameId)).toEqual(["a"]);
    expect(plan.adoptLocal).toEqual([]);
    expect(plan.deleteLocal).toEqual([]);
  });

  it("tombstone con remoto → deleteRemote; sin remoto → dropLocal", () => {
    const local = [
      rec({ gameId: "a", deletedAt: 1 }),
      rec({ gameId: "b", deletedAt: 1 }),
    ];
    const plan = planSync(local, [row({ id: "a" })]);
    expect(plan.deleteRemote).toEqual(["a"]);
    expect(plan.dropLocal).toEqual(["b"]);
  });

  it("remoto nuevo → adoptLocal; remoto sobre synced local → adoptLocal (el servidor manda)", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "synced" })], [row({ id: "a" }), row({ id: "c" })]);
    expect(plan.adoptLocal.map((r) => r.id).sort()).toEqual(["a", "c"]);
  });

  it("synced local ausente en remoto → deleteLocal (lo borró otro dispositivo)", () => {
    const plan = planSync([rec({ gameId: "a", syncStatus: "synced" })], []);
    expect(plan.deleteLocal).toEqual(["a"]);
  });

  it("un tombstone nunca se adopta del remoto aunque exista la fila", () => {
    const plan = planSync([rec({ gameId: "a", deletedAt: 1 })], [row({ id: "a" })]);
    expect(plan.adoptLocal).toEqual([]);
  });

  it("tombstone + pending a la vez: el tombstone gana SIEMPRE, nunca push", () => {
    const withRemote = planSync(
      [rec({ gameId: "a", deletedAt: 1, syncStatus: "pending" })],
      [row({ id: "a" })],
    );
    expect(withRemote.deleteRemote).toEqual(["a"]);
    expect(withRemote.dropLocal).toEqual([]);
    expect(withRemote.push).toEqual([]);

    const withoutRemote = planSync(
      [rec({ gameId: "a", deletedAt: 1, syncStatus: "pending" })],
      [],
    );
    expect(withoutRemote.dropLocal).toEqual(["a"]);
    expect(withoutRemote.deleteRemote).toEqual([]);
    expect(withoutRemote.push).toEqual([]);
  });
});

describe("conversores", () => {
  it("rowFromRecord: fechas ISO del primer/último evento y savedAt; recordFromRow invierte", () => {
    const record = rec({ gameId: "a", syncStatus: "pending" });
    const asRow = rowFromRecord(record);
    expect(asRow.id).toBe("a");
    expect(Date.parse(asRow.started_at)).toBe(record.committed[0].at);
    expect(Date.parse(asRow.finished_at)).toBe(record.committed[record.committed.length - 1].at);
    const back = recordFromRow(asRow, "uid-1");
    expect(back.gameId).toBe("a");
    expect(back.identity).toBe("uid-1");
    expect(back.syncStatus).toBe("synced");
    expect(back.deletedAt).toBeNull();
    expect(back.committed).toEqual(record.committed);
  });
});

function fakeApi(initialRows: PlayGameRow[] = []) {
  const rows = new Map(initialRows.map((r) => [r.id, r]));
  const calls: string[] = [];
  const api: PlayGamesApi = {
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

describe("runSavedSync", () => {
  it("push de pending: sube y marca synced", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "pending" }));
    const { api, rows } = fakeApi();
    await runSavedSync("uid-1", api);
    expect(rows.has("a")).toBe(true);
    expect((await listSaved("uid-1"))[0].syncStatus).toBe("synced");
  });

  it("tombstone: borra remoto y luego local; si el remove falla, el tombstone sobrevive", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "synced", deletedAt: 5 }));
    const { api } = fakeApi([row({ id: "a" })]);
    await runSavedSync("uid-1", api);
    expect(await listSaved("uid-1")).toEqual([]);

    await saveFinished(rec({ gameId: "b", identity: "uid-1", syncStatus: "synced", deletedAt: 5 }));
    const failing = { ...fakeApi([row({ id: "b" })]).api, remove: async () => ({ error: true }) };
    await runSavedSync("uid-1", failing);
    expect((await listSaved("uid-1"))[0].deletedAt).toBe(5);
  });

  it("pull: adopta remotas nuevas como synced y borra las synced ausentes", async () => {
    await saveFinished(rec({ gameId: "vieja", identity: "uid-1", syncStatus: "synced" }));
    const { api } = fakeApi([row({ id: "nueva" })]);
    await runSavedSync("uid-1", api);
    const ids = (await listSaved("uid-1")).map((r) => r.gameId);
    expect(ids).toEqual(["nueva"]);
  });

  it("selectAll con error: no toca NADA local", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "pending" }));
    await runSavedSync("uid-1", { ...fakeApi().api, selectAll: async () => ({ error: true as const }) });
    expect((await listSaved("uid-1"))[0].syncStatus).toBe("pending");
  });

  it("upsert con error: los pending siguen pending", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "pending" }));
    await runSavedSync("uid-1", { ...fakeApi().api, upsert: async () => ({ error: true }) });
    expect((await listSaved("uid-1"))[0].syncStatus).toBe("pending");
  });

  // I2: el ejecutor relee antes de escribir en vez de pisar con lo que vio al
  // planificar (mismo motivo que la guarda de sesión de I1: hay una ventana de
  // red entre leer y escribir en la que el usuario puede cambiar el registro).

  it("tombstone puesto DURANTE la pasada (en el hueco de red del pull): el adoptLocal no resucita la partida", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "synced" }));
    const { api } = fakeApi([row({ id: "a" })]);
    const racy: PlayGamesApi = {
      ...api,
      async selectAll() {
        const result = await api.selectAll();
        // El usuario borra "a" (que era synced) desde el historial, en otra
        // pestaña o la misma, MIENTRAS esta pasada ya tiene el snapshot remoto
        // pero todavía no ha escrito el adoptLocal correspondiente.
        await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "synced", deletedAt: 9000 }));
        return result;
      },
    };
    await runSavedSync("uid-1", racy);
    const after = (await listSaved("uid-1")).find((r) => r.gameId === "a");
    expect(after?.deletedAt).toBe(9000);
  });

  it("pending borrado en duro DURANTE la pasada (en el hueco de red del push): el mark-synced no lo re-escribe", async () => {
    await saveFinished(rec({ gameId: "a", identity: "uid-1", syncStatus: "pending" }));
    const { api } = fakeApi();
    const racy: PlayGamesApi = {
      ...api,
      async upsert(incoming) {
        const result = await api.upsert(incoming);
        // Un pending nunca tuvo copia remota: borrarlo mientras estaba pending
        // es un borrado directo (ver handleDelete en saved-games.tsx), no un
        // tombstone. Simula que ocurre mientras el upsert está en vuelo.
        await deleteSaved("a");
        return result;
      },
    };
    await runSavedSync("uid-1", racy);
    expect((await listSaved("uid-1")).find((r) => r.gameId === "a")).toBeUndefined();
  });
});
