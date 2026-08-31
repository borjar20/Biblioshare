import { describe, expect, it } from "vitest";
import { planSync, rowFromRecord, recordFromRow, type PlayGameRow } from "./sync";
import type { SavedGameRecord } from "./db";
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
