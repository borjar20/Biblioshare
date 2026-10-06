// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBDatabase } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as db from "@/lib/play/core/db";
import { authSession, deferred, savedRecord } from "@/lib/play/core/saved-session-fixtures.test-support";
import { createPlayGamesApi } from "@/lib/play/core/play-games-api";
import { purgePlaySavedOnLogout } from "@/lib/play/core/logout";
import { SavedGames } from "./saved-games";

const authentication = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  auth: authentication,
  // The background pass cannot change the mirror while a local action is tested.
  from: () => ({ select: async () => ({ data: null, error: new Error("remote unavailable") }) }),
}) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partidas" }));

const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeEach(async () => {
  await db.__resetDbForTests();
  authentication.getSession.mockReset().mockResolvedValue(authSession("uid-A", "A-next"));
  authentication.getUser.mockReset().mockResolvedValue({ data: { user: { id: "uid-A" } }, error: null });
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; postMessage() {} close() {} });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); },
  });
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector) {
    return selector === ":modal" ? this instanceof HTMLDialogElement && this.open : matches.call(this, selector);
  });
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (showModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModal);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close);
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  await db.__resetDbForTests();
});

async function retainedHistory() {
  const pending = savedRecord("retained-pending", "uid-A", "pending");
  const anonymous = savedRecord("anonymous", "anon", "pending");
  const other = savedRecord("other", "uid-B", "pending");
  await db.startSavedSession("uid-A", "A-first");
  for (const row of [pending, anonymous, other]) expect(await db.saveFinished(row)).toBe(true);
  await db.purgeSyncedSavedFor("uid-A", "A-first");
  return { pending, anonymous, other };
}

// El registro ha confirmado realmente en IDB. Sólo se retrasa su ACK al
// consumidor, dejando abierta la ventana para un relevo de Auth o logout.
function holdRegisteredSessionAck() {
  const entered = deferred<void>(), release = deferred<void>();
  const transaction = IDBDatabase.prototype.transaction;
  let holding = true;
  vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (this: IDBDatabase, ...args) {
    const tx = transaction.apply(this, args);
    const stores = typeof args[0] === "string" ? [args[0]] : Array.from(args[0]);
    if (holding && stores.length === 1 && stores[0] === "saved_sessions" && args[1] === "readwrite") {
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

async function clickHistoryAction(action: "delete" | "adopt") {
  render(<SavedGames identity="uid-A" />);
  if (action === "delete") fireEvent.click(await screen.findByRole("button", { name: /tools.score.name/ }));
  const button = await screen.findByRole<HTMLButtonElement>("button", { name: action === "delete" ? "saved.delete" : "saved.adopt" });
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
}

async function waitForHistoryAction(action: "delete" | "adopt") {
  await waitFor(() => {
    const button = screen.queryByRole<HTMLButtonElement>("button", { name: action === "delete" ? "saved.delete" : "saved.adopt" });
    expect(button?.disabled ?? false).toBe(false);
  });
}

it("el botón real de borrar espera la nueva sesión verificada y elimina la pending retenida", async () => {
  const { pending, anonymous, other } = await retainedHistory();
  const response = deferred<{ data: { user: { id: string } }; error: null }>();
  authentication.getUser.mockReturnValue(response.promise);
  render(<SavedGames identity="uid-A" />);
  fireEvent.click(await screen.findByRole("button", { name: /tools.score.name/ }));
  await waitFor(() => expect(authentication.getUser).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "saved.delete" }));
  expect(await db.readSaved(pending.gameId)).toEqual(pending);
  await act(async () => { response.resolve({ data: { user: { id: "uid-A" } }, error: null }); });
  await waitFor(async () => expect(await db.readSaved(pending.gameId)).toBeNull());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await db.listSaved("anon")).toEqual([anonymous]);
  expect(await db.listSaved("uid-B")).toEqual([other]);
});

it("el botón real de adoptar espera la nueva sesión verificada sin que el pull adopte por su cuenta", async () => {
  const { pending, anonymous, other } = await retainedHistory();
  const response = deferred<{ data: { user: { id: string } }; error: null }>();
  authentication.getUser.mockReturnValue(response.promise);
  render(<SavedGames identity="uid-A" />);
  fireEvent.click(await screen.findByRole("button", { name: "saved.adopt" }));
  await waitFor(() => expect(authentication.getUser).toHaveBeenCalled());
  expect(await db.readSaved(anonymous.gameId)).toEqual(anonymous);
  await act(async () => { response.resolve({ data: { user: { id: "uid-A" } }, error: null }); });
  await waitFor(async () => expect(await db.readSaved(anonymous.gameId)).toEqual({ ...anonymous, identity: "uid-A", syncStatus: "pending" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "saved.adopt" })).toBeNull());
  expect(await db.readSaved(pending.gameId)).toEqual(pending);
  expect(await db.listSaved("uid-B")).toEqual([other]);
});

it.each(["delete", "adopt"] as const)("%s rechazado si Auth cambia de A a B durante la validación", async (action) => {
  const { pending, anonymous, other } = await retainedHistory();
  const response = deferred<{ data: { user: { id: string } }; error: null }>();
  authentication.getUser.mockReturnValue(response.promise);
  render(<SavedGames identity="uid-A" />);
  if (action === "delete") fireEvent.click(await screen.findByRole("button", { name: /tools.score.name/ }));
  const button = await screen.findByRole<HTMLButtonElement>("button", { name: action === "delete" ? "saved.delete" : "saved.adopt" });
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  await waitFor(() => expect(authentication.getUser).toHaveBeenCalled());
  authentication.getSession.mockResolvedValue(authSession("uid-B", "B-current"));
  await act(async () => { response.resolve({ data: { user: { id: "uid-A" } }, error: null }); });
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(await db.readSaved(pending.gameId)).toEqual(pending);
  expect(await db.readSaved(anonymous.gameId)).toEqual(anonymous);
  expect(await db.listSaved("uid-B")).toEqual([other]);
  expect(await db.readSavedSession("uid-A")).toBeNull();
  if (action === "delete") expect(screen.getByRole("dialog")).toBeDefined();
});

it.each(["delete", "adopt"] as const)("%s rechazado si el token verificado pertenece a la sesión retirada", async (action) => {
  const { pending, anonymous } = await retainedHistory();
  authentication.getSession.mockResolvedValue(authSession("uid-A", "A-first"));
  render(<SavedGames identity="uid-A" />);
  if (action === "delete") fireEvent.click(await screen.findByRole("button", { name: /tools.score.name/ }));
  const button = await screen.findByRole<HTMLButtonElement>("button", { name: action === "delete" ? "saved.delete" : "saved.adopt" });
  fireEvent.click(button);
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(await db.readSaved(pending.gameId)).toEqual(pending);
  expect(await db.readSaved(anonymous.gameId)).toEqual(anonymous);
  expect(await db.readSavedSession("uid-A")).toBeNull();
});

it("borrar y adoptar siguen funcionando offline en una generación ya validada, sin nuevas consultas al servidor", async () => {
  const { pending, anonymous } = await retainedHistory();
  expect(await createPlayGamesApi("uid-A").prepareSession!()).not.toBeNull();
  authentication.getUser.mockReset().mockRejectedValue(new Error("offline"));
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<SavedGames identity="uid-A" />);
  fireEvent.click(await screen.findByRole("button", { name: /tools.score.name/ }));
  fireEvent.click(screen.getByRole("button", { name: "saved.delete" }));
  await waitFor(async () => expect(await db.readSaved(pending.gameId)).toBeNull());
  fireEvent.click(await screen.findByRole("button", { name: "saved.adopt" }));
  await waitFor(async () => expect((await db.readSaved(anonymous.gameId))?.identity).toBe("uid-A"));
  expect(authentication.getUser).not.toHaveBeenCalled();
});

it("borrar después de validar usa el syncStatus vigente y conserva el tombstone de una copia ya subida", async () => {
  const { pending } = await retainedHistory();
  const response = deferred<{ data: { user: { id: string } }; error: null }>();
  authentication.getUser.mockReturnValue(response.promise);
  render(<SavedGames identity="uid-A" />);
  fireEvent.click(await screen.findByRole("button", { name: /tools.score.name/ }));
  fireEvent.click(screen.getByRole("button", { name: "saved.delete" }));
  await waitFor(() => expect(authentication.getUser).toHaveBeenCalled());
  // Otro documento ha validado la misma sesión y confirmado la subida.
  const session = (await db.startSavedSession("uid-A", "A-next"))!;
  expect(await db.saveFinished({ ...pending, syncStatus: "synced" }, session)).toBe(true);
  await act(async () => { response.resolve({ data: { user: { id: "uid-A" } }, error: null }); });
  await waitFor(async () => expect(await db.readSaved(pending.gameId)).toMatchObject({ identity: "uid-A", syncStatus: "synced", deletedAt: expect.any(Number) }));
});

it.each([
  ["delete", "A→B", "uid-B", "B-current"],
  ["adopt", "A→B", "uid-B", "B-current"],
  ["delete", "A→B→A con otro session_id", "uid-A", "A-after-B"],
  ["adopt", "A→B→A con otro session_id", "uid-A", "A-after-B"],
] as const)("%s rechaza el relevo %s después de confirmar IDB y antes de recibir el ACK", async (action, _handoff, finalIdentity, finalSessionId) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const original = await retainedHistory();
  const held = holdRegisteredSessionAck();
  try {
    await clickHistoryAction(action);
    await held.entered;
    expect(authentication.getUser).toHaveBeenCalledExactlyOnceWith(authSession("uid-A", "A-next").data.session.access_token);
    const registered = await db.readSavedSession("uid-A");
    expect(registered?.sessionId).toBe("A-next");
    authentication.getSession.mockResolvedValue(authSession("uid-B", "B-current"));
    if (finalIdentity === "uid-A") authentication.getSession.mockResolvedValue(authSession(finalIdentity, finalSessionId));
    await act(async () => { held.release(); });
    await waitForHistoryAction(action);
    expect(await db.readSaved(original.pending.gameId)).toEqual(original.pending);
    expect(await db.readSaved(original.anonymous.gameId)).toEqual(original.anonymous);
    expect(await db.readSaved(original.other.gameId)).toEqual(original.other);
    expect(await db.readSavedSession("uid-A")).toEqual(registered);
    if (action === "delete") expect(screen.getByRole("dialog")).toBeDefined();
  } finally { held.release(); }
});

it.each(["delete", "adopt"] as const)("%s permite refresh de la misma sesión durante el ACK sin repetir getUser", async (action) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const original = await retainedHistory();
  const held = holdRegisteredSessionAck();
  try {
    await clickHistoryAction(action);
    await held.entered;
    expect(authentication.getUser).toHaveBeenCalledExactlyOnceWith(authSession("uid-A", "A-next").data.session.access_token);
    authentication.getSession.mockResolvedValue(authSession("uid-A", "A-next", 1));
    authentication.getUser.mockRejectedValue(new Error("offline after verification"));
    await act(async () => { held.release(); });
    await waitForHistoryAction(action);
    if (action === "delete") {
      expect(await db.readSaved(original.pending.gameId)).toBeNull();
      expect(await db.readSaved(original.anonymous.gameId)).toEqual(original.anonymous);
    } else {
      expect(await db.readSaved(original.pending.gameId)).toEqual(original.pending);
      expect(await db.readSaved(original.anonymous.gameId)).toMatchObject({ identity: "uid-A", syncStatus: "pending" });
    }
    expect(await db.readSaved(original.other.gameId)).toEqual(original.other);
    expect(authentication.getUser).toHaveBeenCalledTimes(1);
  } finally { held.release(); }
});

it.each(["delete", "adopt"] as const)("%s sigue rechazado por un logout confirmado durante el ACK aunque Auth local aún muestre A", async (action) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const original = await retainedHistory();
  const held = holdRegisteredSessionAck();
  try {
    await clickHistoryAction(action);
    await held.entered;
    expect(await purgePlaySavedOnLogout()).toMatchObject({ ok: true });
    await act(async () => { held.release(); });
    await waitForHistoryAction(action);
    expect(await db.readSaved(original.pending.gameId)).toEqual(original.pending);
    expect(await db.readSaved(original.anonymous.gameId)).toEqual(original.anonymous);
    expect(await db.readSaved(original.other.gameId)).toEqual(original.other);
    expect(await db.readSavedSession("uid-A")).toBeNull();
    if (action === "delete") expect(screen.getByRole("dialog")).toBeDefined();
  } finally { held.release(); }
});
