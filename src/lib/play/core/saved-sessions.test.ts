import "fake-indexeddb/auto";
import { IDBCursor, IDBDatabase, IDBIndex } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as db from "./db";
import { authSession, deferred, savedRecord } from "./saved-session-fixtures.test-support";
import { __createPlayStoreForTests } from "./store";

const authentication = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: authentication }) }));
beforeEach(async () => {
  await db.__resetDbForTests();
  authentication.getSession.mockReset().mockResolvedValue(authSession("uid-A", "A-first"));
  authentication.getUser.mockReset().mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.__resetDbForTests(); });

it("purga exacta por identidad: conserva pending, ambos tombstones, B, anon, active, players y companion", async () => {
  const session = await db.startSavedSession("uid-A", "A-first");
  expect(session).not.toBeNull();
  const rows = [savedRecord("a-synced"), savedRecord("a-pending", "uid-A", "pending"),
    savedRecord("a-delete-pending", "uid-A", "pending", 42), savedRecord("a-delete-synced", "uid-A", "synced", 43),
    savedRecord("b", "uid-B"), savedRecord("anon", "anon")];
  for (const row of rows) expect(await db.saveFinished(row)).toBe(true);
  const active = { identity: "uid-A", v: 1 as const, committed: rows[0].committed.slice(0, 1), pending: null, rev: 1 };
  const player = { playerId: "p", identity: "uid-A", v: 1 as const, name: "Ana", syncStatus: "pending" as const, deletedAt: null };
  const companion = { identity: "uid-A", v: 1 as const, base: null, log: [], rev: 1 };
  await db.writeActive(active); await db.putPlayer(player); await db.writeCompanion(companion);
  expect(await db.purgeSyncedSavedFor("uid-A", "A-first")).toEqual({ ok: true, deleted: 1, retained: 3, generation: session!.generation + 1 });
  expect(await db.listSaved("uid-A")).toEqual([rows[2], rows[3], rows[1]]);
  expect(await db.listSaved("uid-B")).toEqual([rows[4]]);
  expect(await db.listSaved("anon")).toEqual([rows[5]]);
  expect(await db.readActive("uid-A")).toEqual({ ok: true, record: active });
  expect(await db.readPlayer("p")).toEqual(player);
  expect(await db.readCompanion("uid-A")).toEqual(companion);
  expect(await db.purgeSyncedSavedFor("anon", "anything")).toEqual({ ok: false, reason: "stale" });
  expect(await db.purgeSyncedSavedFor("uid-A", "A-first")).toMatchObject({ ok: true, deleted: 0, retained: 3 });
});

it("refresh no rota; nuevas sesiones reabren; todos los ids retirados y escrituras ABA quedan rechazados", async () => {
  const first = (await db.startSavedSession("uid-A", "A-first"))!;
  expect(await db.startSavedSession("uid-A", "A-first")).toEqual(first);
  await db.purgeSyncedSavedFor("uid-A", "A-first");
  expect(await db.readSavedSession("uid-A")).toBeNull();
  const second = (await db.startSavedSession("uid-A", "A-second"))!;
  expect(second.generation).toBeGreaterThan(first.generation);
  expect(await db.saveFinished(savedRecord("new"), second)).toBe(true);
  expect(await db.saveFinished(savedRecord("old"), first)).toBe(false);
  expect(await db.purgeSyncedSavedFor("uid-A", "A-first")).toEqual({ ok: false, reason: "stale" });
  await db.purgeSyncedSavedFor("uid-A", "A-second");
  const third = (await db.startSavedSession("uid-A", "A-third"))!;
  expect(third.generation).toBeGreaterThan(second.generation);
  for (const id of ["A-first", "A-second"]) expect(await db.startSavedSession("uid-A", id)).toBeNull();
  expect(await db.saveFinished(savedRecord("second-late"), second)).toBe(false);
  expect(await db.saveFinished(savedRecord("third"), third)).toBe(true);
  expect((await db.listSaved("uid-A")).map((row) => row.gameId)).toEqual(["third"]);
});

it("guardar desde la sesión cerrada falla sin vaciar la partida activa ni inventar otro pending", async () => {
  await db.startSavedSession("uid-A", "A-first");
  const store = __createPlayStoreForTests("uid-A");
  try {
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    const log = savedRecord("active").committed;
    expect(store.start(log[0])).toBe(true);
    expect(store.dispatch(log[1])).toBe(true);
    await store.__drainWritesForTests();
    const active = await db.readActive("uid-A"), snapshot = store.getSnapshot();
    await db.purgeSyncedSavedFor("uid-A", "A-first");
    expect(await store.save()).toBe(false);
    await store.__drainWritesForTests();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(await db.readActive("uid-A")).toEqual(active);
    expect(await db.listSaved("uid-A")).toEqual([]);
  } finally { store.destroy(); }
});

it("una sesión nueva guarda desde la herramienta directa, sin visitar el hub ni iniciar sync", async () => {
  const first = (await db.startSavedSession("uid-A", "A-first"))!;
  const store = __createPlayStoreForTests("uid-A");
  try {
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    const log = savedRecord("direct").committed;
    store.start(log[0]); store.dispatch(log[1]); await store.__drainWritesForTests();
    await db.purgeSyncedSavedFor("uid-A", "A-first");
    authentication.getSession.mockResolvedValue(authSession("uid-A", "A-direct-new"));
    expect(await store.save()).toBe(true);
    await store.__drainWritesForTests();
    expect(authentication.getUser).toHaveBeenCalledWith(authSession("uid-A", "A-direct-new").data.session.access_token);
    expect((await db.readSavedSession("uid-A"))!.generation).toBeGreaterThan(first.generation);
    expect(store.getSnapshot().game).toBeNull();
    expect(await db.readActive("uid-A")).toEqual({ ok: true, record: null });
    expect(await db.listSaved("uid-A")).toEqual([expect.objectContaining({ gameId: "direct", syncStatus: "pending" })]);
  } finally { store.destroy(); }
});

it("ACK local de save recibido tras logout conserva active y la fuente pending ya confirmada", async () => {
  await db.startSavedSession("uid-A", "A-first");
  const store = __createPlayStoreForTests("uid-A");
  const committed = deferred<void>(), resume = deferred<void>();
  let saving: Promise<boolean> | undefined;
  try {
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    const log = savedRecord("local-ack").committed;
    store.start(log[0]); store.dispatch(log[1]); await store.__drainWritesForTests();
    const active = await db.readActive("uid-A"), snapshot = store.getSnapshot();
    const transaction = IDBDatabase.prototype.transaction;
    let hold = true;
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (this: IDBDatabase, ...args) {
      const tx = transaction.apply(this, args);
      const stores = Array.isArray(args[0]) ? args[0] : [args[0]];
      if (hold && stores.includes("saved") && args[1] === "readwrite") {
        hold = false;
        // Sólo se demora el ACK: la transacción real ha guardado el pending.
        Object.defineProperty(tx, "oncomplete", { set(callback: IDBTransaction["oncomplete"]) {
          tx.addEventListener("complete", (event) => {
            committed.resolve(); void resume.promise.then(() => callback?.call(tx, event));
          }, { once: true });
        } });
      }
      return tx;
    });
    saving = store.save(); await committed.promise;
    await db.purgeSyncedSavedFor("uid-A", "A-first");
    resume.resolve(); expect(await saving).toBe(false);
    await store.__drainWritesForTests();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(await db.readActive("uid-A")).toEqual(active);
    expect(await db.listSaved("uid-A")).toEqual([expect.objectContaining({ gameId: "local-ack", syncStatus: "pending" })]);
  } finally { resume.resolve(); await saving; store.destroy(); }
});

it("dos módulos/conexiones reales comparten la barrera transaccional sin recibir BroadcastChannel", async () => {
  const connections = new Set<IDBDatabase>();
  const transaction = IDBDatabase.prototype.transaction;
  vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (this: IDBDatabase, ...args) {
    connections.add(this);
    return transaction.apply(this, args);
  });
  const first = (await db.startSavedSession("uid-A", "A-first"))!;
  expect(await db.isSavedSessionCurrent(first)).toBe(true);
  vi.resetModules();
  const otherDocument = await import("./db");
  expect(otherDocument.startSavedSession).not.toBe(db.startSavedSession);
  // Abrir ambas conexiones antes de fijar el orden: abrir la segunda BD no
  // debe confundirse con haber encolado ya su transacción de cierre.
  await otherDocument.readSavedSession("uid-A");
  const closing = otherDocument.purgeSyncedSavedFor("uid-A", "A-first");
  const late = db.saveFinished(savedRecord("late"), first);
  expect(await closing).toMatchObject({ ok: true });
  expect(await late).toBe(false);
  expect(await db.listSaved("uid-A")).toEqual([]);
  const next = (await otherDocument.startSavedSession("uid-A", "A-next"))!;
  const b = savedRecord("collision", "uid-B");
  await otherDocument.saveFinished(b);
  expect(await db.saveFinished(savedRecord("collision"), next)).toBe(false);
  await db.deleteSaved("collision", next);
  expect(await otherDocument.readSaved("collision")).toEqual(b);
  expect(await otherDocument.saveFinished(savedRecord("next"), next)).toBe(true);
  expect(await db.saveFinished(savedRecord("late-again"), first)).toBe(false);
  expect(connections.size).toBe(2);
  await otherDocument.__resetDbForTests();
});

it("un abort de la purga revierte juntos la eliminación y el retiro de sesión; unavailable no equivale a éxito", async () => {
  const session = (await db.startSavedSession("uid-A", "A-first"))!;
  const original = savedRecord("keep");
  await db.saveFinished(original, session);
  const deleteCursor = IDBCursor.prototype.delete;
  const injected = vi.spyOn(IDBCursor.prototype, "delete").mockImplementation(function (this: IDBCursor) {
    const request = deleteCursor.call(this);
    const tx = this.source instanceof IDBIndex ? this.source.objectStore.transaction : this.source.transaction;
    queueMicrotask(() => tx.abort());
    return request;
  });
  expect(await db.purgeSyncedSavedFor("uid-A", "A-first")).toEqual({ ok: false, reason: "unavailable" });
  injected.mockRestore();
  expect(await db.readSavedSession("uid-A")).toEqual(session);
  expect(await db.listSaved("uid-A")).toEqual([original]);
  await db.__resetDbForTests();
  vi.stubGlobal("indexedDB", undefined);
  expect(await db.purgeSyncedSavedFor("uid-A", "A-first")).toEqual({ ok: false, reason: "unavailable" });
  expect(await db.startSavedSession("uid-A", "A-new")).toBeNull();
});

it("v4→v5 es aditivo y atómico al abortar; reintenta sin reset y cierra su conexión por versionchange", async () => {
  const saved = savedRecord("v4-pending", "uid-A", "pending");
  const active = { identity: "uid-A", v: 1, committed: saved.committed.slice(0, 1), pending: null, rev: 9 };
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(db.DB_NAME, 4);
    request.onupgradeneeded = () => {
      const source = request.result;
      source.createObjectStore("active", { keyPath: "identity" });
      source.createObjectStore("saved", { keyPath: "gameId" }).createIndex("identity", "identity");
      source.createObjectStore("players", { keyPath: "playerId" }).createIndex("identity", "identity");
      source.createObjectStore("companion", { keyPath: "identity" });
    };
    request.onsuccess = () => {
      const source = request.result;
      const tx = source.transaction(["active", "saved"], "readwrite");
      tx.objectStore("active").put(active); tx.objectStore("saved").put(saved);
      tx.oncomplete = () => { source.close(); resolve(); }; tx.onabort = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
  const createStore = IDBDatabase.prototype.createObjectStore;
  const injected = vi.spyOn(IDBDatabase.prototype, "createObjectStore").mockImplementation(function (this: IDBDatabase, ...args) {
    const store = createStore.apply(this, args);
    if (args[0] === "saved_sessions") queueMicrotask(() => store.transaction.abort());
    return store;
  });
  expect(await db.readSavedSession("uid-A")).toBeNull();
  injected.mockRestore();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(db.DB_NAME, 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const source = request.result;
      expect(source.version).toBe(4);
      expect(Array.from(source.objectStoreNames)).toEqual(["active", "companion", "players", "saved"]);
      const tx = source.transaction(["saved", "active"], "readonly");
      const a = tx.objectStore("active").get("uid-A"), s = tx.objectStore("saved").get(saved.gameId);
      tx.oncomplete = () => { expect(a.result).toEqual(active); expect(s.result).toEqual(saved); source.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  });
  expect(await db.readSavedSession("uid-A")).toEqual({ identity: "uid-A", generation: 0, sessionId: null });
  expect(await db.listSaved("uid-A")).toEqual([saved]);
  expect(await db.readActive("uid-A")).toEqual({ ok: true, record: active });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(db.DB_NAME, db.DB_VERSION + 1);
    request.onblocked = () => reject(new Error("la conexión cacheada no cerró por versionchange"));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      expect(Array.from(request.result.objectStoreNames)).toEqual(["active", "companion", "players", "saved", "saved_sessions"]);
      request.result.close(); resolve();
    };
  });
});
