// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { __resetDbForTests, listSaved, saveFinished, writeActive, readActive, startSavedSession, type SavedGameRecord } from "@/lib/play/core/db";
import { replay } from "@/lib/play/core/replay";
import { buildSavedSummary } from "@/lib/play/tools";
import type { PlayEvent } from "@/lib/play/core/types";
import { LogoutButton } from "./logout-button";

const mocks = vi.hoisted(() => ({ logout: vi.fn(), getUser: vi.fn(), getSession: vi.fn() }));
vi.mock("@/app/(auth)/actions", () => ({ logout: mocks.logout }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser, getSession: mocks.getSession } }) }));
vi.mock("@/lib/push/platform", () => ({ getNotificationPlatform: () => "web" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

function record(gameId: string, identity: string, syncStatus: "pending" | "synced", deletedAt: number | null = null): SavedGameRecord {
  const committed: PlayEvent[] = [
    { id: gameId, type: "game_started", at: 1000, payload: { toolId: "score", setup: { participants: [{ id: "a", kind: "guest", name: "Ana" }, { id: "b", kind: "guest", name: "Beto" }], direction: "highest" } } },
    { id: `${gameId}-finish`, type: "game_finished", at: 2000, payload: { reason: "manual" } },
  ];
  return { gameId, identity, v: 2, committed, savedAt: 3000, summary: buildSavedSummary(replay(committed)), syncStatus, deletedAt };
}

beforeEach(async () => {
  await __resetDbForTests();
  mocks.logout.mockReset().mockResolvedValue(undefined);
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
  const token = `test.${btoa(JSON.stringify({ session_id: "session-A" }))}.fixture`;
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "uid-A" }, access_token: token } }, error: null });
});
afterEach(async () => { cleanup(); await __resetDbForTests(); vi.restoreAllMocks(); });

it("el logout real purga sólo synced de A antes de salir y conserva fuentes pendientes, B, anon y activa (#975)", async () => {
  const pending = record("A-pending", "uid-A", "pending");
  const tombstone = record("A-delete", "uid-A", "synced", 1234);
  const own = record("A-synced", "uid-A", "synced");
  const other = record("B-synced", "uid-B", "synced");
  const anonymous = record("anon-saved", "anon", "pending");
  for (const row of [pending, tombstone, own, other, anonymous]) expect(await saveFinished(row)).toBe(true);
  const active = { identity: "uid-A", v: 1 as const, committed: own.committed.slice(0, 1), pending: null, rev: 1 };
  expect(await writeActive(active)).toEqual({ ok: true });
  let atLogout: SavedGameRecord[] = [];
  mocks.logout.mockImplementation(async () => { atLogout = await listSaved("uid-A"); });
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole("button", { name: "logout" }));
  await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(atLogout.map((row) => row.gameId)).toEqual(["A-delete", "A-pending"]));
  expect(await listSaved("uid-A")).toEqual([tombstone, pending]);
  expect(await listSaved("uid-B")).toEqual([other]);
  expect(await listSaved("anon")).toEqual([anonymous]);
  expect(await readActive("uid-A")).toEqual({ ok: true, record: active });
});

it("sin Auth verificable permite salir sin atribuirse una purga ni borrar otra identidad", async () => {
  const own = record("A-synced", "uid-A", "synced");
  const other = record("B-synced", "uid-B", "synced");
  await saveFinished(own);
  await saveFinished(other);
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Auth no disponible") });
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole("button", { name: "logout" }));
  await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
  expect(await listSaved("uid-A")).toEqual([own]);
  expect(await listSaved("uid-B")).toEqual([other]);
});

it("logout de una sesión A nueva registra su contexto aunque aún no haya abierto el hub", async () => {
  await startSavedSession("uid-A", "session-A-before");
  await saveFinished(record("A-mirror", "uid-A", "synced"));
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole("button", { name: "logout" }));
  await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
  expect(await listSaved("uid-A")).toEqual([]);
  expect(await startSavedSession("uid-A", "session-A-before")).toBeNull();
  expect(await startSavedSession("uid-A", "session-A")).toBeNull();
});
