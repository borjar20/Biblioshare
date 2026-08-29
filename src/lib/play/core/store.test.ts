import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "./events";
import { BURST_WINDOW_MS } from "./log";
import { getPlayStore, parseSnapshot, playStorageKey, serializeSnapshot, __resetPlayStoresForTests } from "./store";
import { started } from "@/lib/play/commander/test-fixtures";
import type { CommanderState } from "@/lib/play/commander/types";

class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

let storage: FakeStorage;
beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("localStorage", storage);
  vi.useFakeTimers();
  __resetPlayStoresForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const tap = (delta: number, at: number) => makeEvent("life_changed", { target: "ana", delta }, at, `t-${at}-${delta}`);

describe("persistencia y aislamiento", () => {
  it("la clave está aislada por identidad: anon no ve la partida de un uid", () => {
    const anon = getPlayStore("anon");
    anon.start(started(1000));
    expect(storage.getItem(playStorageKey("anon"))).not.toBeNull();
    expect(getPlayStore("uid-borja").getSnapshot()).toBeNull();
  });

  it("playStorageKey rechaza una identidad vacía", () => {
    expect(() => playStorageKey("")).toThrow();
  });

  it("playStorageKey rechaza una identidad de solo espacios", () => {
    expect(() => playStorageKey("   ")).toThrow();
  });

  it("playStorageKey con una identidad normal produce la clave esperada", () => {
    expect(playStorageKey("uid-borja")).toBe("biblioshare:play:uid-borja:active");
  });

  it("persiste también la ráfaga abierta y rehidrata (sellándola) tras un 'cierre'", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.tap(tap(-3, 2000));
    // 'cierre': un store nuevo lee lo persistido sin que haya habido flush
    __resetPlayStoresForTests();
    const reborn = getPlayStore("anon");
    const game = reborn.getSnapshot();
    expect((game?.state as CommanderState).players[0].life).toBe(37);
  });

  it("un snapshot corrupto o inválido se descarta sin lanzar", () => {
    storage.setItem(playStorageKey("anon"), "{esto no es json");
    expect(getPlayStore("anon").getSnapshot()).toBeNull();
    // semánticamente inválido: no empieza por game_started
    storage.setItem(playStorageKey("x"), serializeSnapshot({ committed: [tap(-1, 1)], pending: null }));
    expect(getPlayStore("x").getSnapshot()).toBeNull();
  });
});

describe("ráfagas y suscripción", () => {
  it("los taps se coalescen y el timer del store sella la ráfaga al vencer la ventana", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.tap(tap(-1, 2000));
    store.tap(tap(-1, 2100));
    expect(store.getSnapshot()?.log.pending).not.toBeNull();
    vi.advanceTimersByTime(BURST_WINDOW_MS + 10);
    expect(store.getSnapshot()?.log.pending).toBeNull();
    expect(store.getSnapshot()?.log.committed.map((e) => e.type)).toEqual(["game_started", "life_changed"]);
  });

  it("getSnapshot es referencialmente estable entre cambios (requisito useSyncExternalStore)", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a);
    store.tap(tap(-1, 2000));
    const b = store.getSnapshot();
    expect(b).not.toBe(a);
    expect(store.getSnapshot()).toBe(b);
  });

  it("notifica a los suscriptores y undo devuelve el evento deshecho", () => {
    const store = getPlayStore("anon");
    const seen: number[] = [];
    store.subscribe(() => seen.push(1));
    store.start(started(1000));
    store.tap(tap(-5, 2000));
    const undone = store.undo();
    expect(undone?.payload).toEqual({ target: "ana", delta: -5 });
    // start() emite 1 vez; el primer tap() abre la ráfaga (no coalesca) y emite
    // 1 vez; undo() descarta la ráfaga aún abierta y emite 1 vez. Total: 3.
    expect(seen.length).toBe(3);
  });

  it("discard borra la clave y deja el snapshot a null", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.discard();
    expect(store.getSnapshot()).toBeNull();
    expect(storage.getItem(playStorageKey("anon"))).toBeNull();
  });
});
