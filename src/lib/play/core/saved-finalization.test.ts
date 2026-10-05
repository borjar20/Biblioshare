import "fake-indexeddb/auto";
import { IDBDatabase, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as db from "./db";
import { purgePlaySavedOnLogout } from "./logout";
import { authSession, deferred, savedRecord } from "./saved-session-fixtures.test-support";
import { __createPlayStoreForTests } from "./store";

const authentication = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: authentication }) }));

beforeEach(async () => {
  await db.__resetDbForTests();
  authentication.getSession.mockReset().mockResolvedValue(authSession("uid-A", "A-first"));
  authentication.getUser.mockReset().mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
  vi.stubGlobal("BroadcastChannel", undefined);
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.__resetDbForTests(); });

// No se demora el ACK de saved: ya se recibió. Se retiene sólo la entrega del
// evento de una lectura posterior real, que conserva su snapshot anterior.
function holdCompletedGenerationRead() {
  const entered = deferred<void>(), release = deferred<void>();
  const transaction = IDBDatabase.prototype.transaction;
  let savedCommitted = false, holding = true;
  vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (this: IDBDatabase, ...args) {
    const tx = transaction.apply(this, args);
    const stores = typeof args[0] === "string" ? [args[0]] : Array.from(args[0]);
    if (stores.includes("saved") && args[1] === "readwrite") {
      tx.addEventListener("complete", () => { savedCommitted = true; }, { once: true });
    }
    if (holding && savedCommitted && stores.length === 1 && stores[0] === "saved_sessions" && args[1] === "readonly") {
      holding = false;
      Object.defineProperty(tx, "oncomplete", { set(callback: IDBTransaction["oncomplete"]) {
        tx.addEventListener("complete", (event) => {
          entered.resolve();
          void release.promise.then(() => callback?.call(tx, event));
        }, { once: true });
      } });
    }
    return tx;
  });
  return { entered: entered.promise, release: () => release.resolve() };
}

async function finishedStore(gameId: string) {
  await db.startSavedSession("uid-A", "A-first");
  const store = __createPlayStoreForTests("uid-A");
  await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
  const log = savedRecord(gameId).committed;
  expect(store.start(log[0])).toBe(true);
  expect(store.dispatch(log[1])).toBe(true);
  await store.__drainWritesForTests();
  return store;
}

it("una lectura de generación entregada después del logout real no libera la activa ni atribuye éxito al save", async () => {
  const store = await finishedStore("late-generation");
  const snapshot = store.getSnapshot(), active = await db.readActive("uid-A");
  const held = holdCompletedGenerationRead();
  let saving: Promise<boolean> | undefined;
  try {
    saving = store.save();
    await held.entered;
    expect(await db.readSaved("late-generation")).toMatchObject({ syncStatus: "pending" });
    expect(await purgePlaySavedOnLogout()).toMatchObject({ ok: true, deleted: 0, retained: 1 });
    held.release();
    expect(await saving).toBe(false);
    await store.__drainWritesForTests();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(await db.readActive("uid-A")).toEqual(active);
    expect(await db.readSaved("late-generation")).toMatchObject({ syncStatus: "pending" });
    expect(await db.readSavedSession("uid-A")).toBeNull();
  } finally { held.release(); await saving; store.destroy(); }
});

it("control: sin cierre ni conflicto, save confirma la fuente y libera la activa", async () => {
  const store = await finishedStore("normal-save");
  try {
    expect(await store.save()).toBe(true);
    await store.__drainWritesForTests();
    expect(store.getSnapshot()).toEqual({ status: "ready", game: null });
    expect(await db.readActive("uid-A")).toEqual({ ok: true, record: null });
    expect(await db.readSaved("normal-save")).toMatchObject({ syncStatus: "pending" });
  } finally { store.destroy(); }
});

it("un relevo real de active entre la lectura y la liberación conserva la partida ganadora", async () => {
  const store = await finishedStore("losing-save");
  const snapshot = store.getSnapshot();
  const active = await db.readActive("uid-A");
  if (!active.ok || !active.record) throw new Error("activa no preparada");
  const held = holdCompletedGenerationRead();
  let saving: Promise<boolean> | undefined;
  try {
    saving = store.save(); await held.entered;
    const next = { identity: "uid-A", v: 1 as const, rev: active.record.rev + 1,
      committed: savedRecord("next-game").committed.slice(0, 1), pending: null };
    expect(await db.writeActive(next)).toEqual({ ok: true });
    held.release();
    expect(await saving).toBe(false);
    await store.__drainWritesForTests();
    expect(await db.readActive("uid-A")).toEqual({ ok: true, record: next });
    expect(store.getSnapshot()).toBe(snapshot);
    expect(await db.readSaved("losing-save")).toMatchObject({ syncStatus: "pending" });
  } finally { held.release(); await saving; store.destroy(); }
});

it("un abort de la liberación revierte el delete de active y no publica un save exitoso", async () => {
  const store = await finishedStore("abort-release");
  const snapshot = store.getSnapshot(), active = await db.readActive("uid-A");
  const remove = IDBObjectStore.prototype.delete;
  vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (this: IDBObjectStore, key) {
    const request = remove.call(this, key);
    if (this.name === "active" && this.transaction.objectStoreNames.contains("saved_sessions")) queueMicrotask(() => this.transaction.abort());
    return request;
  });
  try {
    expect(await store.save()).toBe(false);
    await store.__drainWritesForTests();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(await db.readActive("uid-A")).toEqual(active);
    expect(await db.readSaved("abort-release")).toMatchObject({ syncStatus: "pending" });
  } finally { store.destroy(); }
});
