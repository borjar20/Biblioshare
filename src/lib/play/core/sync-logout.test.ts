import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetDbForTests, listSaved, readSaved, saveFinished, startSavedSession, purgeSyncedSavedFor } from "./db";
import { rowFromRecord, runSavedSync, SAVED_CHANNEL_PREFIX, type PlayGamesApi, type PlayGameRow } from "./sync";
import { deferred, savedRecord } from "./saved-session-fixtures.test-support";

beforeEach(async () => {
  await __resetDbForTests();
  // Sin entrega de canal: estos casos deben probar la barrera persistida.
  vi.stubGlobal("BroadcastChannel", undefined);
});
afterEach(async () => { vi.unstubAllGlobals(); await __resetDbForTests(); });

function api(rows: PlayGameRow[] = []): PlayGamesApi {
  return { selectAll: async () => ({ rows }), upsert: async () => ({ error: false }), remove: async () => ({ error: false }) };
}

it("pull tardío de una fila nueva no repuebla A tras logout ni tras login A nuevo; B/anon quedan intactos", async () => {
  const first = (await startSavedSession("uid-A", "session-first"))!;
  const b = savedRecord("b", "uid-B"), anonymous = savedRecord("anon", "anon");
  await saveFinished(b); await saveFinished(anonymous);
  const response = deferred<{ rows: PlayGameRow[] }>();
  const entered = deferred<void>();
  const running = runSavedSync("uid-A", { ...api(), prepareSession: async () => first,
    selectAll: () => { entered.resolve(); return response.promise; } });
  await entered.promise;
  await purgeSyncedSavedFor("uid-A", "session-first");
  const next = (await startSavedSession("uid-A", "session-next"))!;
  await runSavedSync("uid-A", { ...api([rowFromRecord(savedRecord("new-session"))]), prepareSession: async () => next });
  response.resolve({ rows: [rowFromRecord(savedRecord("old-session"))] });
  await running;
  expect((await listSaved("uid-A")).map((r) => r.gameId)).toEqual(["new-session"]);
  expect(await listSaved("uid-B")).toEqual([b]); expect(await listSaved("anon")).toEqual([anonymous]);
});

it("ACK de push tardío conserva la fuente pending después de logout", async () => {
  const first = (await startSavedSession("uid-A", "session-first"))!;
  const pending = savedRecord("pending", "uid-A", "pending");
  await saveFinished(pending);
  const response = deferred<{ error: boolean }>(), entered = deferred<void>();
  const running = runSavedSync("uid-A", { ...api(), prepareSession: async () => first,
    upsert: () => { entered.resolve(); return response.promise; } });
  await entered.promise;
  await purgeSyncedSavedFor("uid-A", "session-first");
  response.resolve({ error: false }); await running;
  expect(await readSaved("pending")).toEqual(pending);
  expect(await saveFinished(savedRecord("late"), first)).toBe(false);
});

it("ACK de remove tardío conserva el tombstone hasta una nueva sesión verificada", async () => {
  const first = (await startSavedSession("uid-A", "session-first"))!;
  const tombstone = savedRecord("deleted", "uid-A", "synced", 42);
  await saveFinished(tombstone);
  const response = deferred<{ error: boolean }>(), entered = deferred<void>();
  const running = runSavedSync("uid-A", { ...api([rowFromRecord(tombstone)]), prepareSession: async () => first,
    remove: () => { entered.resolve(); return response.promise; } });
  await entered.promise;
  await purgeSyncedSavedFor("uid-A", "session-first");
  response.resolve({ error: false }); await running;
  expect(await readSaved("deleted")).toEqual(tombstone);
  const next = (await startSavedSession("uid-A", "session-next"))!;
  await runSavedSync("uid-A", { ...api(), prepareSession: async () => next });
  expect(await listSaved("uid-A")).toEqual([]);
});

it("una señal de logout antigua entregada tarde no cancela la nueva sesión A", async () => {
  await startSavedSession("uid-A", "session-first");
  const closed = await purgeSyncedSavedFor("uid-A", "session-first");
  if (!closed.ok) throw new Error("cierre no confirmado");
  const next = (await startSavedSession("uid-A", "session-next"))!;
  let listener: ((event: MessageEvent) => void) | null = null;
  vi.stubGlobal("BroadcastChannel", class {
    constructor(name: string) { expect(name).toBe(SAVED_CHANNEL_PREFIX + "uid-A"); }
    set onmessage(value: (event: MessageEvent) => void) { listener = value; }
    postMessage() {}
    close() {}
  });
  await runSavedSync("uid-A", { ...api(), prepareSession: async () => next, selectAll: async () => {
    listener?.({ data: { type: "session-ended", generation: closed.generation } } as MessageEvent);
    return { rows: [rowFromRecord(savedRecord("legitimate"))] };
  } });
  expect((await listSaved("uid-A")).map((row) => row.gameId)).toEqual(["legitimate"]);
});
