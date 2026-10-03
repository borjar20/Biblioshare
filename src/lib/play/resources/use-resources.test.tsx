// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBDatabase } from "fake-indexeddb";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDbForTests, readCompanion, writeCompanion } from "@/lib/play/core/db";
import { makeEvent } from "@/lib/play/core/events";
import { valueOf } from "./selectors";
import { useResources } from "./use-resources";

beforeEach(async () => { await __resetDbForTests(); });
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await __resetDbForTests();
});

async function seedFive(identity = "anon") {
  expect(await writeCompanion({
    identity: `${identity}:resources`, v: 1, base: null, rev: 2,
    log: [
      makeEvent("players_set", { players: ["Ana"] }, 1, "players"),
      makeEvent("resource_added", { name: "Oro", emoji: "gold", initial: 5, shared: false }, 2, "gold"),
    ],
  })).toEqual({ ok: true });
}

/** Sólo se controla la frontera IDB: transacción y solicitudes reales,
 *  sin sustituir el hook, el core, el reducer ni resultados de db.ts. */
function holdNextWrite() {
  let holding = true;
  let entered!: () => void;
  let finished!: () => void;
  let active: ReturnType<IDBDatabase["transaction"]> | null = null;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const completed = new Promise<void>(resolve => { finished = resolve; });
  const native = IDBDatabase.prototype.transaction;
  const interceptor = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(
    function (this: IDBDatabase, names, mode, options) {
      const tx = native.call(this, names, mode, options);
      const stores = typeof names === "string" ? [names] : Array.from(names);
      if (mode === "readwrite" && stores.includes("companion")) {
        interceptor.mockRestore();
        active = tx;
        const store = tx.objectStore("companion");
        const keepPending = () => {
          if (holding) store.get("__resources_1328_hold__").onsuccess = keepPending;
        };
        tx.addEventListener("complete", finished, { once: true });
        tx.addEventListener("abort", finished, { once: true });
        keepPending();
        entered();
      }
      return tx;
    },
  );
  return {
    started, completed,
    release: () => { holding = false; },
    abort: () => { holding = false; active?.abort(); },
  };
}

describe("Recursos — publicación durable #1328", () => {
  it("mantiene 5 pendiente; confirma 6 antes de publicarlo y lo restaura al remontar inmediatamente", async () => {
    await seedFive();
    const current = renderHook(() => useResources("anon"));
    await waitFor(() => expect(current.result.current.loaded).toBe(true));
    const write = holdNextWrite();
    try {
      act(() => { expect(current.result.current.emit("resource_updated", {
        name: "Oro", initial: 6, shared: false,
      })).toBe(true); });
      await write.started;
      expect(valueOf(current.result.current.state, "Oro", "Ana")).toBe(5);
      expect(current.result.current.state.defs[0].initial).toBe(5);
      expect(current.result.current.persistence).toBe("pending");
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(current.result.current.persistence).toBe("saved"));
    expect(valueOf(current.result.current.state, "Oro", "Ana")).toBe(6);
    current.unmount();
    const restored = renderHook(() => useResources("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(valueOf(restored.result.current.state, "Oro", "Ana")).toBe(6);
    expect(await readCompanion("anon:resources")).toMatchObject({ rev: 3, log: [
      { type: "players_set" }, { type: "resource_added" },
      { type: "resource_updated", payload: { name: "Oro", initial: 6, shared: false } },
    ] });
  });

  it("acumula deltas y deshacer sobre el head lógico antes del primer ACK", async () => {
    await seedFive();
    const { result } = renderHook(() => useResources("anon"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const write = holdNextWrite();
    try {
      act(() => {
        for (const delta of [1, 2, 3]) expect(result.current.emit("adjusted", {
          resource: "Oro", owner: "Ana", delta,
        })).toBe(true);
        result.current.undo();
      });
      await write.started;
      expect(valueOf(result.current.state, "Oro", "Ana")).toBe(5);
      expect(result.current.persistence).toBe("pending");
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(result.current.persistence).toBe("saved"));
    expect(valueOf(result.current.state, "Oro", "Ana")).toBe(8);
    const record = await readCompanion("anon:resources");
    expect(record?.rev).toBe(6);
    expect(record?.log.map(event => event.type)).toEqual(["players_set", "resource_added", "adjusted", "adjusted"]);
    expect(record?.log.slice(2).map(event => event.payload)).toEqual([
      { resource: "Oro", owner: "Ana", delta: 1 },
      { resource: "Oro", owner: "Ana", delta: 2 },
    ]);
  });

  it("un aborto real publica en memoria y remontar recupera el último 5 durable", async () => {
    await seedFive();
    const current = renderHook(() => useResources("anon"));
    await waitFor(() => expect(current.result.current.loaded).toBe(true));
    const write = holdNextWrite();
    act(() => { current.result.current.emit("adjusted", { resource: "Oro", owner: "Ana", delta: 1 }); });
    await write.started;
    await act(async () => { write.abort(); await write.completed; });
    await waitFor(() => expect(current.result.current.persistence).toBe("memory"));
    expect(valueOf(current.result.current.state, "Oro", "Ana")).toBe(6);
    expect((await readCompanion("anon:resources"))?.rev).toBe(2);
    current.unmount();
    const restored = renderHook(() => useResources("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(valueOf(restored.result.current.state, "Oro", "Ana")).toBe(5);
    expect(restored.result.current.persistence).toBe("saved");
  });

  it("rechaza callbacks antes de hidratar y deltas inválidos sin crear una revisión", async () => {
    await seedFive();
    const { result } = renderHook(() => useResources("anon"));
    act(() => { expect(result.current.emit("players_set", { players: ["Beto"] })).toBe(false); });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      expect(result.current.emit("adjusted", { resource: "Oro", owner: "Ana", delta: 0 })).toBe(false);
      expect(result.current.emit("adjusted", { resource: "Otro", owner: "Ana", delta: 1 })).toBe(false);
    });
    expect(valueOf(result.current.state, "Oro", "Ana")).toBe(5);
    expect(result.current.persistence).toBe("saved");
    expect((await readCompanion("anon:resources"))?.rev).toBe(2);
  });

  it("un ACK anterior y sus callbacks no modifican la identidad nueva", async () => {
    await seedFive("owner-a");
    const { result, rerender } = renderHook(({ identity }) => useResources(identity), {
      initialProps: { identity: "owner-a" },
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const stale = { emit: result.current.emit, undo: result.current.undo, clear: result.current.clear };
    const write = holdNextWrite();
    try {
      act(() => { result.current.emit("adjusted", { resource: "Oro", owner: "Ana", delta: 1 }); });
      await write.started;
      rerender({ identity: "owner-b" });
      expect(result.current.loaded).toBe(false);
      act(() => { expect(stale.emit("players_set", { players: ["Intruso"] })).toBe(false); });
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state).toEqual({ players: [], defs: [], values: [] });
    act(() => {
      expect(stale.emit("players_set", { players: ["Intruso"] })).toBe(false);
      stale.undo();
      stale.clear();
      expect(result.current.emit("resource_added", { name: "Reserva", emoji: "", initial: 10, shared: true })).toBe(true);
    });
    await waitFor(() => expect(result.current.persistence).toBe("saved"));
    expect(valueOf(result.current.state, "Reserva", null)).toBe(10);
    expect((await readCompanion("owner-a:resources"))?.rev).toBe(3);
    expect((await readCompanion("owner-b:resources"))?.log.map(event => event.type)).toEqual(["resource_added"]);
  });

  it("una instancia nueva espera la escritura aceptada de la misma clave", async () => {
    await seedFive();
    const current = renderHook(() => useResources("anon"));
    await waitFor(() => expect(current.result.current.loaded).toBe(true));
    const write = holdNextWrite();
    let restored: typeof current | undefined;
    try {
      act(() => { current.result.current.emit("adjusted", { resource: "Oro", owner: "Ana", delta: 1 }); });
      await write.started;
      expect(current.result.current.persistence).toBe("pending");
      current.unmount();
      restored = renderHook(() => useResources("anon"));
      await act(async () => { await Promise.resolve(); });
      expect(restored.result.current.loaded).toBe(false);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(restored!.result.current.loaded).toBe(true));
    expect(valueOf(restored!.result.current.state, "Oro", "Ana")).toBe(6);
    expect((await readCompanion("anon:resources"))?.rev).toBe(3);
  });
});
