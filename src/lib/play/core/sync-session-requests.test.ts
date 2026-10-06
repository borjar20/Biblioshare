import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetDbForTests, listSaved, purgeSyncedSavedFor, readSavedSession, startSavedSession } from "./db";
import { requestSavedSync, rowFromRecord, type PlayGamesApi, type PlayGameRow } from "./sync";
import { deferred, savedRecord } from "./saved-session-fixtures.test-support";

const mocked = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./play-games-api", () => ({ createPlayGamesApi: mocked.create }));
beforeEach(async () => {
  await __resetDbForTests(); mocked.create.mockReset();
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(async () => { vi.unstubAllGlobals(); await __resetDbForTests(); });

it("una sesión A nueva avanza sin esperar a la vieja; el finally viejo no suelta el candado nuevo ni duplica el pull", async () => {
  const old = (await startSavedSession("uid-A", "first"))!;
  const oldReply = deferred<{ rows: PlayGameRow[] }>(), oldEntered = deferred<void>();
  const oldApi: PlayGamesApi = { prepareSession: async () => old,
    selectAll: vi.fn(() => { oldEntered.resolve(); return oldReply.promise; }),
    upsert: async () => ({ error: false }), remove: async () => ({ error: false }) };
  mocked.create.mockReturnValueOnce(oldApi);
  requestSavedSync("uid-A");
  await oldEntered.promise;
  await purgeSyncedSavedFor("uid-A", "first");
  const next = (await startSavedSession("uid-A", "next"))!;
  const nextReply = deferred<{ rows: PlayGameRow[] }>(), nextEntered = deferred<void>();
  const nextApi: PlayGamesApi = { prepareSession: async () => next,
    selectAll: vi.fn(() => { nextEntered.resolve(); return nextReply.promise; }),
    upsert: async () => ({ error: false }), remove: async () => ({ error: false }) };
  mocked.create.mockReturnValue(nextApi);
  requestSavedSync("uid-A");
  await nextEntered.promise;
  oldReply.resolve({ rows: [rowFromRecord(savedRecord("retired"))] });
  // Las lecturas reales serializadas drenan el chequeo de la respuesta vieja;
  // no se altera ningún callback ni estado interno de requestSavedSync.
  await readSavedSession("uid-A"); await readSavedSession("uid-A");
  requestSavedSync("uid-A");
  await vi.waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(3));
  await readSavedSession("uid-A");
  expect(nextApi.selectAll).toHaveBeenCalledTimes(1);
  nextReply.resolve({ rows: [rowFromRecord(savedRecord("current"))] });
  await vi.waitFor(() => expect(nextApi.selectAll).toHaveBeenCalledTimes(2));
  await readSavedSession("uid-A"); await readSavedSession("uid-A");
  await vi.waitFor(async () => expect((await listSaved("uid-A")).map((r) => r.gameId)).toEqual(["current"]));
});
