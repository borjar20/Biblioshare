import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDbForTests,
  DB_NAME,
  DB_VERSION,
  listSaved,
  readActive,
  saveFinished,
  type ActiveGameRecord,
  type SavedGameRecord,
} from "./db";
import type { PlayEvent } from "./types";
import { replay } from "./replay";
import { buildSavedSummary } from "../tools";

const setup = {
  participants: [
    { id: "ana", kind: "user", name: "Ana", userId: "user-ana-1" },
    { id: "beto", kind: "guest", name: "Beto" },
  ],
  direction: "highest",
};

function log(gameId: string): PlayEvent[] {
  return [
    { id: gameId, type: "game_started", at: 1000, payload: { toolId: "score", setup } },
    { id: `${gameId}-round`, type: "round_scored", at: 1500, payload: { scores: [5, 3] } },
    { id: `${gameId}-finish`, type: "game_finished", at: 2000, payload: { reason: "manual" } },
  ];
}

function savedV1(gameId: string, corrupt = false) {
  return {
    gameId,
    identity: "anon",
    v: 1,
    committed: corrupt ? log(gameId).slice(1) : log(gameId),
    savedAt: 3000,
  };
}

const originals = [
  savedV1("a-first"),
  savedV1("b-corrupt", true),
  savedV1("c-update-target"),
  savedV1("d-delete-target", true),
  savedV1("e-last"),
];
const active: ActiveGameRecord = {
  identity: "anon", v: 1, committed: log("active").slice(0, 2), pending: null, rev: 7,
};

async function seedV1() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("active", { keyPath: "identity" });
      const saved = db.createObjectStore("saved", { keyPath: "gameId" });
      saved.createIndex("identity", "identity");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["active", "saved"], "readwrite");
      tx.objectStore("active").put(active);
      for (const record of originals) tx.objectStore("saved").put(record);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

// Leer sin versión conserva la fuente v1 para verificar el rollback: no
// llama al módulo ni provoca otro intento de migración.
async function physicalSnapshot() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["active", "saved"], "readonly");
      const active = tx.objectStore("active").getAll();
      const saved = tx.objectStore("saved").getAll();
      tx.oncomplete = () => resolve({
        version: db.version, stores: Array.from(db.objectStoreNames),
        active: active.result, saved: saved.result,
      });
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

type BackendRecord = { key: IDBValidKey; value: unknown };
type FakeRawStore = {
  storeRecord(record: BackendRecord, ...args: unknown[]): unknown;
  deleteRecord(key: IDBValidKey, ...args: unknown[]): unknown;
};

// Frontera de fault injection: backend en RAM de fake-indexeddb 6.2.5.
// El cursor devuelve su petición real; el fallo ocurre al ejecutar la cola
// asíncrona. No sustituimos onerror, abort/rollback ni callbacks de db.ts.
// No simula llenar la cuota de disco de un navegador.
function failQueuedStorage(method: "storeRecord" | "deleteRecord", key: string, errorName: string) {
  const realOpen = indexedDB.open.bind(indexedDB);
  const restoreBackend: Array<() => void> = [];
  const errors: Array<{ name: string | undefined; canceled: boolean }> = [];
  const aborts: Array<string | undefined> = [];
  const openErrors: Array<string | undefined> = [];
  const firstAttempt: string[] = [];
  let enabled = true;
  let restored = false;
  let attempts = 0;
  vi.spyOn(indexedDB, "open").mockImplementation((name, version) => {
    const request = realOpen(name, version);
    if (name === DB_NAME && version === DB_VERSION) {
      request.addEventListener("upgradeneeded", () => {
        attempts += 1;
        const tx = request.transaction!;
        const raw = (tx.objectStore("saved") as IDBObjectStore & { _rawObjectStore: FakeRawStore })
          ._rawObjectStore;
        const storeRecord = raw.storeRecord, deleteRecord = raw.deleteRecord;
        restoreBackend.push(() => { raw.storeRecord = storeRecord; raw.deleteRecord = deleteRecord; });
        raw.storeRecord = function (record, ...args) {
          if (attempts === 1 && args[1] !== undefined) firstAttempt.push(`update:${record.key}`);
          if (enabled && method === "storeRecord" && record.key === key) {
            throw new DOMException("injected asynchronous storage failure", errorName);
          }
          return storeRecord.call(this, record, ...args);
        };
        raw.deleteRecord = function (recordKey, ...args) {
          if (attempts === 1 && args[0] !== undefined) firstAttempt.push(`delete:${recordKey}`);
          if (enabled && method === "deleteRecord" && recordKey === key) {
            throw new DOMException("injected asynchronous storage failure", errorName);
          }
          return deleteRecord.call(this, recordKey, ...args);
        };
        tx.addEventListener("error", (event) => errors.push({
          name: (event.target as IDBRequest).error?.name, canceled: event.defaultPrevented,
        }));
        tx.addEventListener("abort", () => aborts.push(tx.error?.name));
      });
      request.addEventListener("error", () => openErrors.push(request.error?.name));
    }
    return request;
  });
  return {
    errors, aborts, openErrors, firstAttempt,
    attempts: () => attempts,
    restore: () => {
      if (restored) return;
      restored = true;
      enabled = false;
      for (const restore of restoreBackend.toReversed()) restore();
    },
  };
}

beforeEach(__resetDbForTests);
afterEach(async () => { await __resetDbForTests(); vi.restoreAllMocks(); });

describe("upgrade v1: errores asíncronos conservan la fuente y permiten reintentar (#977)", () => {
  it.each([
    ["storeRecord", "c-update-target", "QuotaExceededError"],
    ["deleteRecord", "d-delete-target", "UnknownError"],
  ] as const)("%s aborta también los cambios previos y vuelve a migrar", async (method, key, errorName) => {
    await seedV1();
    const before = await physicalSnapshot();
    const fault = failQueuedStorage(method, key, errorName);
    try {
      const attemptedSave: SavedGameRecord = {
        ...originals[0], v: 2, summary: buildSavedSummary(replay(originals[0].committed)),
        syncStatus: "pending", deletedAt: null,
      };
      const fallback = await Promise.all([readActive("anon"), listSaved("anon"), saveFinished(attemptedSave)]);
      expect(fallback).toEqual([{ ok: false, reason: "unavailable" }, [], false]);
      expect(fault.firstAttempt.slice(0, 3)).toEqual([
        "update:a-first", "delete:b-corrupt", "update:c-update-target",
      ]);
      if (method === "deleteRecord") expect(fault.firstAttempt[3]).toBe("delete:d-delete-target");
      expect(fault.errors).toContainEqual({ name: errorName, canceled: false });
      expect(fault.aborts).toEqual([errorName]);
      expect(fault.openErrors).toEqual(["AbortError"]);
      expect(await physicalSnapshot()).toEqual(before);
      expect(before).toEqual({ version: 1, stores: ["active", "saved"], active: [active], saved: originals });

      // La cuota/fallo sigue presente: otro intento falla sin alterar v1.
      expect(await readActive("anon")).toEqual({ ok: false, reason: "unavailable" });
      expect(fault.attempts()).toBe(2);
      expect(await physicalSnapshot()).toEqual(before);
      fault.restore();

      // Sin reset entre fallo y reintento: una promesa rota cacheada lo impediría.
      expect(await readActive("anon")).toEqual({ ok: true, record: active });
      const migrated = await listSaved("anon");
      expect(fault.attempts()).toBe(3);
      expect(migrated.map((r) => r.gameId)).toEqual(["a-first", "c-update-target", "e-last"]);
      for (const record of migrated) {
        const original = originals.find((old) => old.gameId === record.gameId)!;
        expect(record).toMatchObject({
          ...original, v: 2, syncStatus: "pending", deletedAt: null, summary: { toolId: "score" },
        });
      }
      expect(await physicalSnapshot()).toEqual({
        version: DB_VERSION, stores: ["active", "companion", "players", "saved"],
        active: [active], saved: migrated,
      });
    } finally { fault.restore(); }
  });
});