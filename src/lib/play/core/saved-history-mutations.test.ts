import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as db from "./db";
import { savedRecord } from "./saved-session-fixtures.test-support";

beforeEach(async () => { await db.__resetDbForTests(); });
afterEach(async () => { await db.__resetDbForTests(); });

it("una mutación con contexto retirado no toca pending/anon, y la generación nueva sí puede hacerlo", async () => {
  const first = (await db.startSavedSession("uid-A", "A-first"))!;
  const pending = savedRecord("pending", "uid-A", "pending"), anon = savedRecord("anon", "anon", "pending");
  await db.saveFinished(pending); await db.saveFinished(anon);
  await db.purgeSyncedSavedFor("uid-A", "A-first");
  expect(await db.deleteSavedFromHistory(pending.gameId, first)).toBe(false);
  expect(await db.adoptAnonymousSaved(anon.gameId, first)).toBe(false);
  expect(await db.readSaved(pending.gameId)).toEqual(pending);
  expect(await db.readSaved(anon.gameId)).toEqual(anon);
  const next = (await db.startSavedSession("uid-A", "A-next"))!;
  expect(await db.deleteSavedFromHistory(pending.gameId, next)).toBe(true);
  expect(await db.adoptAnonymousSaved(anon.gameId, next)).toBe(true);
  expect(await db.listSaved("uid-A")).toEqual([{ ...anon, identity: "uid-A", syncStatus: "pending" }]);
});

it("borrar/adoptar no cambian otra identidad ni resucitan un tombstone anónimo", async () => {
  const session = (await db.startSavedSession("uid-A", "A-first"))!;
  const other = savedRecord("other", "uid-B", "pending"), deleted = savedRecord("deleted-anon", "anon", "pending", 42);
  await db.saveFinished(other); await db.saveFinished(deleted);
  expect(await db.deleteSavedFromHistory(other.gameId, session)).toBe(false);
  expect(await db.adoptAnonymousSaved(other.gameId, session)).toBe(false);
  expect(await db.adoptAnonymousSaved(deleted.gameId, session)).toBe(false);
  expect(await db.readSaved(other.gameId)).toEqual(other);
  expect(await db.readSaved(deleted.gameId)).toEqual(deleted);
});
