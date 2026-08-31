import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetDbForTests,
  deleteActive,
  deletePlayer,
  deleteSaved,
  DB_NAME,
  listPlayers,
  listSaved,
  putPlayer,
  readActive,
  readPlayer,
  saveFinished,
  writeActive,
  type ActiveGameRecord,
  type PlayerRecord,
  type SavedGameRecord,
} from "./db";
import { makeEvent } from "./events";
import { replay } from "./replay";
import { buildSavedSummary } from "../tools";
import type { PlayEvent } from "./types";
import type { ScoreSetup } from "../score/types";

function record(rev: number): ActiveGameRecord {
  return {
    identity: "anon",
    v: 1,
    committed: [{ id: "e1", type: "game_started", at: 1000, payload: {} }],
    pending: null,
    rev,
  };
}

// Log mínimo válido (game_started + game_finished, herramienta "score") para
// que buildSavedSummary/replay no revienten -- mismo patrón que tools.test.ts.
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

function savedRecordV2(overrides: { gameId: string; identity: string }): SavedGameRecord {
  const committed = scoreLog(overrides.gameId);
  return {
    gameId: overrides.gameId,
    identity: overrides.identity,
    v: 2,
    committed,
    savedAt: 3000,
    summary: buildSavedSummary(replay(committed)),
    syncStatus: "pending",
    deletedAt: null,
  };
}

// Siembra una BD versión 1 (esquema/registros crudos, sin pasar por el
// módulo) para probar la migración v1->v2 real del onupgradeneeded.
async function seedV1(
  records: Array<{ gameId: string; identity: string; v: 1; committed: PlayEvent[]; savedAt: number }>,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("active")) {
        db.createObjectStore("active", { keyPath: "identity" });
      }
      if (!db.objectStoreNames.contains("saved")) {
        const saved = db.createObjectStore("saved", { keyPath: "gameId" });
        saved.createIndex("identity", "identity");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("saved", "readwrite");
      for (const r of records) tx.objectStore("saved").put(r);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

// Siembra una BD versión 2 (esquema/registros crudos, sin pasar por el
// módulo) para probar la migración v2->v3 real del onupgradeneeded: el
// almacén `players` no existe aún, `saved` ya tiene registros v2.
async function seedV2(records: SavedGameRecord[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("active")) {
        db.createObjectStore("active", { keyPath: "identity" });
      }
      if (!db.objectStoreNames.contains("saved")) {
        const saved = db.createObjectStore("saved", { keyPath: "gameId" });
        saved.createIndex("identity", "identity");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("saved", "readwrite");
      for (const r of records) tx.objectStore("saved").put(r);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function playerRecord(
  overrides: { playerId: string; identity: string; name: string } & Partial<PlayerRecord>,
): PlayerRecord {
  return { v: 1, syncStatus: "pending", deletedAt: null, ...overrides };
}

beforeEach(async () => {
  await __resetDbForTests();
});

describe("active", () => {
  it("escribe y lee el registro por identidad", async () => {
    expect(await writeActive(record(1))).toEqual({ ok: true });
    const read = await readActive("anon");
    expect(read?.rev).toBe(1);
    expect(read?.committed).toHaveLength(1);
  });

  it("sin registro devuelve null, y otra identidad no ve el ajeno", async () => {
    await writeActive(record(1));
    expect(await readActive("uid-x")).toBeNull();
  });

  it("CAS: un rev igual o menor NO pisa y devuelve el registro vigente", async () => {
    await writeActive(record(2));
    const result = await writeActive(record(2));
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "conflict") {
      expect(result.current.rev).toBe(2);
    } else {
      throw new Error("esperaba conflict");
    }
    // rev mayor sí pisa
    expect(await writeActive(record(3))).toEqual({ ok: true });
  });

  it("deleteActive borra y es idempotente", async () => {
    await writeActive(record(1));
    await deleteActive("anon");
    await deleteActive("anon");
    expect(await readActive("anon")).toBeNull();
  });
});

describe("saved", () => {
  it("guarda una partida terminada", async () => {
    const ok = await saveFinished(savedRecordV2({ gameId: "e1", identity: "anon" }));
    expect(ok).toBe(true);
  });
});

describe("saved v2", () => {
  it("listSaved devuelve solo los registros de la identidad, y deleteSaved borra", async () => {
    await saveFinished(savedRecordV2({ gameId: "g1", identity: "anon" }));
    await saveFinished(savedRecordV2({ gameId: "g2", identity: "uid-1" }));
    const anon = await listSaved("anon");
    expect(anon.map((r) => r.gameId)).toEqual(["g1"]);
    await deleteSaved("g1");
    expect(await listSaved("anon")).toEqual([]);
  });

  it("migración v1→v2: el registro gana summary derivado y queda pending", async () => {
    // Sembrar una BD versión 1 con un registro v1 (sin summary/syncStatus),
    // cerrar, reabrir con el módulo (DB_VERSION 2) y leer.
    await seedV1([{ gameId: "g1", identity: "anon", v: 1, committed: scoreLog("g1"), savedAt: 3000 }]);
    const migrated = await listSaved("anon");
    expect(migrated[0].v).toBe(2);
    expect(migrated[0].syncStatus).toBe("pending");
    expect(migrated[0].deletedAt).toBeNull();
    expect(migrated[0].summary.toolId).toBe("score");
  });

  it("migración v1→v2: un log corrupto se descarta en vez de romper el upgrade", async () => {
    // registro v1 cuyo committed no empieza por game_started → tras migrar, no está
    await seedV1([
      {
        gameId: "bad",
        identity: "anon",
        v: 1,
        committed: [makeEvent("round_scored", { scores: [1, 2] }, 1000, "bad")],
        savedAt: 3000,
      },
    ]);
    expect(await listSaved("anon")).toEqual([]);
  });
});

describe("players (fase 6)", () => {
  it("putPlayer/listPlayers aíslan por identidad y deletePlayer borra", async () => {
    await putPlayer(playerRecord({ playerId: "j1", identity: "uid-1", name: "Pablo" }));
    await putPlayer(playerRecord({ playerId: "j2", identity: "uid-2", name: "Otro" }));
    expect((await listPlayers("uid-1")).map((p) => p.name)).toEqual(["Pablo"]);
    await deletePlayer("j1");
    expect(await listPlayers("uid-1")).toEqual([]);
  });

  it("readPlayer devuelve null si no existe", async () => {
    expect(await readPlayer("nadie")).toBeNull();
  });

  it("migración v2→v3: crea el almacén players sin tocar las guardadas", async () => {
    await seedV2([savedRecordV2({ gameId: "g1", identity: "anon" })]);
    expect((await listSaved("anon")).map((r) => r.gameId)).toEqual(["g1"]);
    expect(await listPlayers("anon")).toEqual([]);
  });
});
