import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "./events";
import { BURST_WINDOW_MS } from "./log";
import {
  getPlayStore,
  parseSnapshot,
  playStorageKey,
  serializeSnapshot,
  SNAPSHOT_VERSION,
  __resetPlayStoresForTests,
} from "./store";
import { makeSetup, started } from "@/lib/play/commander/test-fixtures";
import type { CommanderState } from "@/lib/play/commander/types";
import type { EventLog } from "./types";

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

describe("parseSnapshot", () => {
  it("round-trip: parseSnapshot(serializeSnapshot(log)) devuelve los eventos commiteados esperados y sella la ráfaga pendiente", () => {
    const log: EventLog = { committed: [started(1000)], pending: tap(-3, 2000) };
    const parsed = parseSnapshot(serializeSnapshot(log));
    // flushPending (spec §3) mueve la ráfaga pendiente a committed tal cual,
    // sin re-coalescerla: así rehidrata el store al releer localStorage.
    expect(parsed).toEqual({ committed: [started(1000), tap(-3, 2000)], pending: null });
  });

  it("raw null devuelve null", () => {
    expect(parseSnapshot(null)).toBeNull();
  });

  it("cadena vacía devuelve null", () => {
    expect(parseSnapshot("")).toBeNull();
  });

  it("JSON malformado devuelve null en vez de lanzar", () => {
    expect(parseSnapshot("{esto no es json")).toBeNull();
  });

  it("una versión de snapshot distinta a SNAPSHOT_VERSION devuelve null", () => {
    const raw = JSON.stringify({ v: SNAPSHOT_VERSION + 1, committed: [started(1000)], pending: null });
    expect(parseSnapshot(raw)).toBeNull();
  });

  it("forma correcta pero semánticamente imposible (el log no empieza por game_started) devuelve null", () => {
    const raw = serializeSnapshot({ committed: [tap(-1, 1000)], pending: null });
    expect(parseSnapshot(raw)).toBeNull();
  });

  it("un evento con 'at' no finito devuelve null", () => {
    const raw = JSON.stringify({
      v: SNAPSHOT_VERSION,
      committed: [{ ...started(1000), at: Number.POSITIVE_INFINITY }],
      pending: null,
    });
    expect(parseSnapshot(raw)).toBeNull();
  });

  it("un evento con 'at' no positivo devuelve null", () => {
    const raw = JSON.stringify({ v: SNAPSHOT_VERSION, committed: [{ ...started(1000), at: 0 }], pending: null });
    expect(parseSnapshot(raw)).toBeNull();
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

describe("eventos inválidos: commit condicional (finding 1 de la revisión final)", () => {
  it("start() con un setup inválido (menos de 2 participantes) no crea partida ni persiste nada", () => {
    const store = getPlayStore("anon");
    const applied = store.start(started(1000, makeSetup(["ana"])));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBeNull();
    expect(storage.getItem(playStorageKey("anon"))).toBeNull();
  });

  it("start() con un evento que no es game_started no crea partida ni persiste nada", () => {
    const store = getPlayStore("anon");
    const applied = store.start(tap(-1, 1000));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBeNull();
    expect(storage.getItem(playStorageKey("anon"))).toBeNull();
  });

  it("tap() con un participante desconocido deja el store exactamente como estaba", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    const before = store.getSnapshot();
    const beforeRaw = storage.getItem(playStorageKey("anon"));
    const applied = store.tap(makeEvent("life_changed", { target: "fantasma", delta: -1 }, 2000, "t-bad"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before); // misma referencia: nada se reasignó
    expect(storage.getItem(playStorageKey("anon"))).toBe(beforeRaw);
  });

  it("dispatch() de un evento tras game_finished se rechaza y el store queda intacto", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.dispatch(makeEvent("game_finished", { winner: "ana", reason: "last_standing" }, 2000, "e-fin"));
    const before = store.getSnapshot();
    const beforeRaw = storage.getItem(playStorageKey("anon"));
    const applied = store.dispatch(makeEvent("turn_passed", {}, 3000, "e-turn"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(storage.getItem(playStorageKey("anon"))).toBe(beforeRaw);
  });

  it("repro de la revisión: doble player_eliminated no revienta getSnapshot ni corrompe lo persistido", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim-1"));
    const before = store.getSnapshot();
    const beforeRaw = storage.getItem(playStorageKey("anon"));
    const applied = store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 3000, "e-elim-2"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(storage.getItem(playStorageKey("anon"))).toBe(beforeRaw);
    // Antes del arreglo esto lanzaba y el snapshot en disco quedaba envenenado
    // (la segunda eliminación se había persistido igualmente).
    expect(() => store.getSnapshot()).not.toThrow();
    const persisted = JSON.parse(storage.getItem(playStorageKey("anon")) ?? "null") as { committed: { type: string }[] };
    expect(persisted.committed.map((e) => e.type)).toEqual(["game_started", "player_eliminated"]);
  });

  it("dispatch() de restaurar a un jugador vivo se rechaza y el store queda intacto", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    const before = store.getSnapshot();
    const beforeRaw = storage.getItem(playStorageKey("anon"));
    const applied = store.dispatch(makeEvent("player_restored", { target: "ana" }, 2000, "e-restore"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(storage.getItem(playStorageKey("anon"))).toBe(beforeRaw);
  });

  it("dispatch() de declarar ganador a un jugador eliminado se rechaza y el store queda intacto", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim"));
    const before = store.getSnapshot();
    const beforeRaw = storage.getItem(playStorageKey("anon"));
    const applied = store.dispatch(makeEvent("game_finished", { winner: "ana", reason: "card" }, 3000, "e-fin"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(storage.getItem(playStorageKey("anon"))).toBe(beforeRaw);
  });

  it("dispatch() de un participante desconocido se rechaza y el store queda intacto", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    const before = store.getSnapshot();
    const beforeRaw = storage.getItem(playStorageKey("anon"));
    const applied = store.dispatch(makeEvent("player_eliminated", { target: "fantasma" }, 2000, "e-ghost"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(storage.getItem(playStorageKey("anon"))).toBe(beforeRaw);
  });

  it("tras un dispatch rechazado, una acción válida se sigue aplicando con normalidad", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim-1"));
    const rejected = store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2500, "e-elim-2"));
    expect(rejected).toBe(false);
    const applied = store.dispatch(makeEvent("player_restored", { target: "ana" }, 3000, "e-restore"));
    expect(applied).toBe(true);
    expect((store.getSnapshot()?.state as CommanderState).players[0].elimination).toBeNull();
  });

  it("el estado sobrevive a una rehidratación tras un dispatch rechazado", () => {
    const store = getPlayStore("anon");
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim-1"));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2500, "e-elim-2")); // rechazado, no persistido
    __resetPlayStoresForTests();
    const reborn = getPlayStore("anon");
    const state = reborn.getSnapshot()?.state as CommanderState;
    expect(state.players[0].elimination).toEqual({ order: 1, round: null, reason: undefined });
    expect(state.players.filter((p) => p.elimination).map((p) => p.participant.id)).toEqual(["ana"]);
  });
});
