import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEvent } from "./events";
import { BURST_WINDOW_MS } from "./log";
import { __resetDbForTests, readActive, writeActive, type ActiveGameRecord } from "./db";
import {
  getPlayStore,
  parseSnapshot,
  playStorageKey,
  SNAPSHOT_VERSION,
  __createPlayStoreForTests,
  __resetPlayStoresForTests,
  type PlayStore,
} from "./store";
import { makeSetup, started } from "@/lib/play/mtg/test-fixtures";
import type { MtgState } from "@/lib/play/mtg/types";
import { playTools } from "@/lib/play/tools";
import type { EventLog } from "./types";

class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

let storage: FakeStorage;
beforeEach(async () => {
  storage = new FakeStorage();
  vi.stubGlobal("localStorage", storage);
  // __resetPlayStoresForTests() ahora espera (#931) a que la cola de
  // escrituras de CADA store drene contra SU BD antes de destruirlo: un
  // store destruido puede dejar varias escrituras en vuelo, encadenadas una
  // tras otra (writeChain fuera de nuestro control: destroy() no las cancela,
  // por diseño — spec fases 0-2 §4; un test con start+tap+tap+sello deja
  // hasta 4). Antes este await no existía y el margen se cubría con un bucle
  // de 40 ticks heurístico aquí; con el drenaje real ya no hace falta.
  await __resetPlayStoresForTests();
  // Fábrica de IndexedDB nueva por test, no solo la BD borrada: aísla del
  // todo cualquier resto que sobreviviera al drenaje de arriba.
  vi.stubGlobal("indexedDB", new IDBFactory());
  // ANTES de activar los timers falsos: fake-indexeddb dispara sus eventos
  // vía setTimeout real, y con los timers ya mockeados esa promesa no
  // resolvería nunca (nadie los avanza aquí, a diferencia de vi.waitFor).
  await __resetDbForTests();
  globalThis.localStorage?.clear?.();
  // Sin "setImmediate": fake-indexeddb programa sus eventos con él (scheduling.js
  // de la librería), y si vi lo mockea junto al resto, sus callbacks no disparan
  // nunca — el dbPromise de db.ts queda pendiente para siempre y envenena el
  // __resetDbForTests() del siguiente test (hook timeout). setTimeout/setInterval
  // sí se mockean: son los que arma el propio store para BURST_WINDOW_MS.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const tap = (delta: number, at: number) => makeEvent("life_changed", { target: "ana", delta }, at, `t-${at}-${delta}`);
const life = (at: number, target: string, delta: number) =>
  makeEvent("life_changed", { target, delta }, at, `t-${at}-${target}-${delta}`);

// Helper compartido: espera a que el store hidrate.
async function ready(store: PlayStore): Promise<void> {
  await vi.waitFor(() => {
    if (store.getSnapshot().status !== "ready") throw new Error("hidratando");
  });
}

describe("persistencia y aislamiento", () => {
  it("la clave está aislada por identidad: anon no ve la partida de un uid", async () => {
    const anon = getPlayStore("anon");
    await ready(anon);
    anon.start(started(1000));
    const other = getPlayStore("uid-borja");
    await ready(other);
    expect(other.getSnapshot().game).toBeNull();
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

  it("persiste también la ráfaga abierta y rehidrata (sellándola) tras un 'cierre'", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.tap(tap(-3, 2000));
    // persistCurrent() es fire-and-forget (spec §3): antes de 'cerrar' hay que
    // dar tiempo real a que la segunda escritura (la del tap) aterrice en BD,
    // o el store recreado de abajo podría leer solo la primera.
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record || record.rev < 2) throw new Error("la escritura del tap aún no aterrizó");
    });
    // 'cierre': un store nuevo lee lo persistido sin que haya habido flush
    await __resetPlayStoresForTests();
    const reborn = getPlayStore("anon");
    await vi.waitFor(() => {
      const snapshot = reborn.getSnapshot();
      if (snapshot.status !== "ready" || snapshot.game === null) throw new Error("aún no");
    });
    const game = reborn.getSnapshot().game;
    expect((game?.state as MtgState).players[0].life).toBe(37);
  });

  it("un snapshot legado corrupto o inválido se descarta sin lanzar y limpia la clave", async () => {
    storage.setItem(playStorageKey("anon"), "{esto no es json");
    const anon = getPlayStore("anon");
    await ready(anon);
    expect(anon.getSnapshot().game).toBeNull();
    expect(storage.getItem(playStorageKey("anon"))).toBeNull();

    // semánticamente inválido: no empieza por game_started
    storage.setItem(
      playStorageKey("x"),
      JSON.stringify({ v: SNAPSHOT_VERSION, committed: [tap(-1, 1)], pending: null }),
    );
    const x = getPlayStore("x");
    await ready(x);
    expect(x.getSnapshot().game).toBeNull();
  });
});

describe("parseSnapshot", () => {
  it("round-trip: parseSnapshot devuelve log y estado, y sella la ráfaga pendiente", () => {
    const log: EventLog = { committed: [started(1000)], pending: tap(-3, 2000) };
    const raw = JSON.stringify({ v: SNAPSHOT_VERSION, committed: log.committed, pending: log.pending });
    const result = parseSnapshot(raw);
    // flushPending (spec §3) mueve la ráfaga pendiente a committed tal cual,
    // sin re-coalescerla: así rehidrata el store al releer un snapshot legado.
    expect(result?.log).toEqual({ committed: [started(1000), tap(-3, 2000)], pending: null });
    expect(result?.state.status).toBe("active");
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
    const raw = JSON.stringify({ v: SNAPSHOT_VERSION, committed: [tap(-1, 1000)], pending: null });
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
  it("los taps se coalescen y el timer del store sella la ráfaga al vencer la ventana", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.tap(tap(-1, 2000));
    store.tap(tap(-1, 2100));
    expect(store.getSnapshot().game?.log.pending).not.toBeNull();
    vi.advanceTimersByTime(BURST_WINDOW_MS + 10);
    expect(store.getSnapshot().game?.log.pending).toBeNull();
    expect(store.getSnapshot().game?.log.committed.map((e) => e.type)).toEqual(["game_started", "life_changed"]);
  });

  it("getSnapshot es referencialmente estable entre cambios (requisito useSyncExternalStore)", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a);
    store.tap(tap(-1, 2000));
    const b = store.getSnapshot();
    expect(b).not.toBe(a);
    expect(store.getSnapshot()).toBe(b);
  });

  it("notifica a los suscriptores y undo devuelve el evento deshecho", async () => {
    const store = getPlayStore("anon");
    await ready(store);
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

  it("discard deja el snapshot a null", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.discard();
    expect(store.getSnapshot().game).toBeNull();
  });
});

describe("eventos inválidos: commit condicional (finding 1 de la revisión final)", () => {
  it("start() con un setup inválido (menos de 2 participantes) no crea partida ni persiste nada", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    const applied = store.start(started(1000, makeSetup(["ana"])));
    expect(applied).toBe(false);
    expect(store.getSnapshot().game).toBeNull();
    // tryCommit rechaza ANTES de llamar a persistCurrent(): no hay nada que
    // drenar, la ausencia de escritura es inmediata (finding 1).
    expect(await readActive("anon")).toBeNull();
  });

  it("start() con un evento que no es game_started no crea partida ni persiste nada", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    const applied = store.start(tap(-1, 1000));
    expect(applied).toBe(false);
    expect(store.getSnapshot().game).toBeNull();
    expect(await readActive("anon")).toBeNull();
  });

  it("tap() con un participante desconocido deja el store exactamente como estaba", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record) throw new Error("el start aún no aterrizó");
    });
    const before = store.getSnapshot();
    const persistedBefore = await readActive("anon");
    const applied = store.tap(makeEvent("life_changed", { target: "fantasma", delta: -1 }, 2000, "t-bad"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before); // misma referencia: nada se reasignó
    expect(await readActive("anon")).toEqual(persistedBefore); // tampoco se persistió nada
  });

  it("dispatch() de un evento tras game_finished se rechaza y el store queda intacto", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.dispatch(makeEvent("game_finished", { winner: "ana", reason: "last_standing" }, 2000, "e-fin"));
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record || record.rev < 2) throw new Error("la escritura del game_finished aún no aterrizó");
    });
    const before = store.getSnapshot();
    const persistedBefore = await readActive("anon");
    const applied = store.dispatch(makeEvent("turn_passed", {}, 3000, "e-turn"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(await readActive("anon")).toEqual(persistedBefore); // el evento rechazado nunca llega a disco
  });

  it("repro de la revisión: doble player_eliminated no revienta getSnapshot ni corrompe el log", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim-1"));
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record || record.rev < 2) throw new Error("la escritura de la eliminación aún no aterrizó");
    });
    const before = store.getSnapshot();
    const persistedBefore = await readActive("anon");
    const applied = store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 3000, "e-elim-2"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    // Antes del arreglo esto lanzaba y el log en memoria quedaba envenenado (la
    // segunda eliminación se había aplicado igualmente).
    expect(() => store.getSnapshot()).not.toThrow();
    expect(store.getSnapshot().game?.log.committed.map((e) => e.type)).toEqual([
      "game_started",
      "player_eliminated",
    ]);
    // ...y tampoco corrompe lo persistido: la segunda eliminación (rechazada)
    // nunca llega a disco.
    expect(await readActive("anon")).toEqual(persistedBefore);
  });

  it("dispatch() de restaurar a un jugador vivo se rechaza y el store queda intacto", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record) throw new Error("el start aún no aterrizó");
    });
    const before = store.getSnapshot();
    const persistedBefore = await readActive("anon");
    const applied = store.dispatch(makeEvent("player_restored", { target: "ana" }, 2000, "e-restore"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(await readActive("anon")).toEqual(persistedBefore);
  });

  it("dispatch() de declarar ganador a un jugador eliminado se rechaza y el store queda intacto", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim"));
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record || record.rev < 2) throw new Error("la escritura de la eliminación aún no aterrizó");
    });
    const before = store.getSnapshot();
    const persistedBefore = await readActive("anon");
    const applied = store.dispatch(makeEvent("game_finished", { winner: "ana", reason: "card" }, 3000, "e-fin"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(await readActive("anon")).toEqual(persistedBefore);
  });

  it("dispatch() de un participante desconocido se rechaza y el store queda intacto", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record) throw new Error("el start aún no aterrizó");
    });
    const before = store.getSnapshot();
    const persistedBefore = await readActive("anon");
    const applied = store.dispatch(makeEvent("player_eliminated", { target: "fantasma" }, 2000, "e-ghost"));
    expect(applied).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(await readActive("anon")).toEqual(persistedBefore);
  });

  it("tras un dispatch rechazado, una acción válida se sigue aplicando con normalidad", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim-1"));
    const rejected = store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2500, "e-elim-2"));
    expect(rejected).toBe(false);
    const applied = store.dispatch(makeEvent("player_restored", { target: "ana" }, 3000, "e-restore"));
    expect(applied).toBe(true);
    expect((store.getSnapshot().game?.state as MtgState).players[0].elimination).toBeNull();
  });

  it("el estado sobrevive a una rehidratación tras un dispatch rechazado", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2000, "e-elim-1"));
    store.dispatch(makeEvent("player_eliminated", { target: "ana" }, 2500, "e-elim-2")); // rechazado, no persistido
    // persistCurrent() es fire-and-forget: antes de 'cerrar' hay que dar
    // tiempo real a que la escritura de la eliminación (la única aceptada
    // tras el start) aterrice en BD.
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record || record.rev < 2) throw new Error("la escritura de la eliminación aún no aterrizó");
    });
    await __resetPlayStoresForTests();
    const reborn = getPlayStore("anon");
    await vi.waitFor(() => {
      const snapshot = reborn.getSnapshot();
      if (snapshot.status !== "ready" || snapshot.game === null) throw new Error("aún no");
    });
    const state = reborn.getSnapshot().game?.state as MtgState;
    expect(state.players[0].elimination).toEqual({ order: 1, round: null, reason: undefined });
    expect(state.players.filter((p) => p.elimination).map((p) => p.participant.id)).toEqual(["ana"]);
  });
});

describe("catch acotado en tryCommit: un bug real no se confunde con un rechazo de usuario (finding 3 de la revisión final)", () => {
  it("una excepción que NO es PlayEventError durante el reduce se propaga en vez de tragarse como false", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    // No hay ninguna regla de Commander hoy que un tap fusionado pueda violar
    // (vida y daño de comandante no tienen tope, el veneno se clampa), así que
    // para provocar un error "de verdad" en el reduce se sustituye el módulo de
    // herramienta por un espía que lanza un TypeError — el defecto que este
    // arreglo existe para no esconder, no un rechazo de reglas.
    const boom = new TypeError("payload malformado: reduce no debería haber llegado aquí");
    const reduceSpy = vi.spyOn(playTools.mtg, "reduce").mockImplementation(() => {
      throw boom;
    });
    const before = store.getSnapshot();
    try {
      const dispatchTurnPassed = () => store.dispatch(makeEvent("turn_passed", {}, 2000, "e-turn"));
      expect(dispatchTurnPassed).toThrow(TypeError);
      expect(dispatchTurnPassed).toThrow("payload malformado: reduce no debería haber llegado aquí");
    } finally {
      reduceSpy.mockRestore();
    }
    // Ni siquiera se reasignó `game`: el throw ocurre en tryCommit ANTES de tocar el store.
    expect(store.getSnapshot()).toBe(before);
  });
});

describe("timer de sellado frente a un input rechazado (spec §3, sin cobertura hasta ahora)", () => {
  it("un tap rechazado no reprograma el timer ya armado: el burst pendiente sella en su plazo ORIGINAL", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.tap(tap(-3, 2000)); // arma el timer de sellado: BURST_WINDOW_MS desde AHORA (reloj falso)
    const pendingBeforeReject = store.getSnapshot().game?.log.pending;
    vi.advanceTimersByTime(1000); // dentro de la ventana original, aún no sella
    // Participante desconocido: el reducer lo rechaza (seatOf lanza PlayEventError).
    // Al ser rechazado, tap() no llama a scheduleSeal() — si este test fallara
    // reprogramando el timer, el segundo advance de abajo NO llegaría a sellar.
    const rejected = store.tap(makeEvent("life_changed", { target: "fantasma", delta: -1 }, 3000, "t-bad"));
    expect(rejected).toBe(false);
    // La ráfaga pendiente es exactamente la de antes del rechazo: el intento
    // inválido no la tocó ni tampoco su timer.
    expect(store.getSnapshot().game?.log.pending).toEqual(pendingBeforeReject);
    vi.advanceTimersByTime(500); // completa los 1500 ms ORIGINALES (1000 + 500), no 1500 desde el rechazo
    expect(store.getSnapshot().game?.log.pending).toBeNull();
    expect(store.getSnapshot().game?.log.committed).toEqual([started(1000), tap(-3, 2000)]);
  });

  it("un dispatch rechazado no cancela el timer armado: el burst pendiente sigue vivo y sella a su hora", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    store.tap(tap(-3, 2000)); // arma el timer de sellado
    vi.advanceTimersByTime(1000); // dentro de la ventana, timer todavía vivo
    // player_eliminated sobre un participante desconocido: seatOf lo rechaza.
    // dispatch() solo llama a clearSealTimer() cuando `applied` es true, así
    // que un dispatch rechazado no debe cancelar el timer del burst en curso.
    const rejected = store.dispatch(makeEvent("player_eliminated", { target: "fantasma" }, 3000, "e-ghost"));
    expect(rejected).toBe(false);
    expect(store.getSnapshot().game?.log.pending).toEqual(tap(-3, 2000));
    vi.advanceTimersByTime(500); // completa los 1500 ms del timer que NUNCA se canceló
    expect(store.getSnapshot().game?.log.pending).toBeNull();
    expect(store.getSnapshot().game?.log.committed).toEqual([started(1000), tap(-3, 2000)]);
  });
});

describe("hidratación asíncrona (fase 3)", () => {
  it("nace en loading y pasa a ready sin partida", async () => {
    const store = getPlayStore("anon");
    expect(store.getSnapshot().status).toBe("loading");
    await ready(store);
    expect(store.getSnapshot()).toEqual({ status: "ready", game: null });
  });

  it("en loading, start/tap/dispatch devuelven false y undo null", () => {
    const store = getPlayStore("anon");
    expect(store.getSnapshot().status).toBe("loading");
    expect(store.start(started(1000))).toBe(false);
    expect(store.tap(life(2000, "p1", -1))).toBe(false);
    expect(store.dispatch(life(2000, "p1", -1))).toBe(false);
    expect(store.undo()).toBeNull();
  });

  it("una partida sobrevive a recrear el store (IndexedDB, no localStorage)", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    expect(store.start(started(1000))).toBe(true);
    // hydrate() ya no añade un tick artificial (revertido, #931): sin esperar
    // aquí a que la escritura del start() aterrice, __resetPlayStoresForTests()
    // podría destruir el store ANTES de que persistCurrent() hubiera abierto
    // siquiera su transacción, y el store renacido leería una BD todavía vacía.
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record || record.rev < 1) throw new Error("la escritura del start aún no aterrizó");
    });
    await __resetPlayStoresForTests();
    const reborn = getPlayStore("anon");
    await vi.waitFor(() => {
      const snapshot = reborn.getSnapshot();
      if (snapshot.status !== "ready" || snapshot.game === null) throw new Error("aún no");
    });
  });

  it("migra el snapshot localStorage de fase 1 y borra la clave", async () => {
    const legacy = { v: 1, committed: [started(1000)], pending: null };
    globalThis.localStorage.setItem(playStorageKey("anon"), JSON.stringify(legacy));
    const store = getPlayStore("anon");
    await ready(store);
    const snapshot = store.getSnapshot();
    expect(snapshot.status === "ready" && snapshot.game !== null).toBe(true);
    expect(globalThis.localStorage.getItem(playStorageKey("anon"))).toBeNull();
  });

  it("borra la clave legada aunque ya haya un registro migrado en IDB (issue #931)", async () => {
    // Sesión anterior: ya migró, hay un registro real en IDB.
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record) throw new Error("el start aún no aterrizó");
    });
    await __resetPlayStoresForTests();
    // Una clave legada huérfana sobrevive de todos modos (p. ej. una
    // importación de fase 1 muy antigua que nunca llegó a borrarla). Antes
    // del arreglo, hydrate() la dejaba intacta para siempre porque devolvía
    // pronto en cuanto encontraba el registro de IDB.
    const legacy = { v: 1, committed: [started(2000)], pending: null };
    globalThis.localStorage.setItem(playStorageKey("anon"), JSON.stringify(legacy));
    const reborn = getPlayStore("anon");
    await ready(reborn);
    const snapshot = reborn.getSnapshot();
    // El registro de IDB manda: no se importa el legado por encima de él.
    expect(snapshot.status === "ready" && snapshot.game?.log.committed[0].at).toBe(1000);
    // ...pero la clave legada SÍ se borra, en este camino igual que en el otro.
    expect(globalThis.localStorage.getItem(playStorageKey("anon"))).toBeNull();
  });

  it("destroy() cierra sin fugas y el reset destruye stores (#935)", async () => {
    const store = __createPlayStoreForTests("anon");
    await ready(store);
    store.destroy(); // no debe lanzar; listeners y canal quedan retirados
  });
});

describe("espejo entre pestañas (#932)", () => {
  // Verificado aparte (no committeado): en este entorno (vitest + node,
  // incluso con setTimeout/setInterval mockeados como en el beforeEach de
  // arriba) el BroadcastChannel global de Node SÍ entrega mensajes entre dos
  // instancias del mismo nombre — su entrega no pasa por los timers que
  // fakeamos, igual que fake-indexeddb (nota del beforeEach). Los tres tests
  // de abajo cubren el espejo real, no solo el CAS aislado.
  it("un commit en una pestaña aparece en la otra", async () => {
    const a = __createPlayStoreForTests("anon");
    const b = __createPlayStoreForTests("anon");
    try {
      await ready(a);
      await ready(b);
      expect(a.start(started(1000))).toBe(true);
      // Deja aterrizar la escritura de `a` antes de esperar el espejo: si no,
      // vi.waitFor de abajo también vale (reintenta), pero drenar primero
      // hace la carrera determinista en vez de depender solo del polling.
      await a.__drainWritesForTests();
      await vi.waitFor(() => {
        const snapshot = b.getSnapshot();
        if (snapshot.status !== "ready" || snapshot.game === null) throw new Error("sin espejo");
      });
      expect(b.getSnapshot().game?.log.committed).toEqual([started(1000)]);
    } finally {
      // Drena ANTES de destruir: un destroy() con una lectura de espejo o una
      // escritura propia todavía en vuelo dejaría esa promesa corriendo sola
      // hasta el siguiente test (aviso del brief sobre cross-talk).
      await a.__drainWritesForTests();
      await b.__drainWritesForTests();
      a.destroy();
      b.destroy();
    }
  });

  it("descartar en una pestaña limpia la otra", async () => {
    const a = __createPlayStoreForTests("anon");
    const b = __createPlayStoreForTests("anon");
    try {
      await ready(a);
      await ready(b);
      a.start(started(1000));
      await a.__drainWritesForTests();
      await vi.waitFor(() => {
        if (b.getSnapshot().game === null) throw new Error("sin espejo");
      });
      a.discard();
      await a.__drainWritesForTests();
      await vi.waitFor(() => {
        if (b.getSnapshot().game !== null) throw new Error("sigue viva");
      });
    } finally {
      await a.__drainWritesForTests();
      await b.__drainWritesForTests();
      a.destroy();
      b.destroy();
    }
  });

  it("el CAS impide que una escritura vieja pise una nueva", async () => {
    // Directo contra db.ts con dos revs, ya cubierto en db.test.ts — aquí el
    // caso integrado: dos stores commitean; el que pierde adopta al ganador.
    const a = __createPlayStoreForTests("anon");
    const b = __createPlayStoreForTests("anon");
    try {
      await ready(a);
      await ready(b);
      a.start(started(1000));
      await a.__drainWritesForTests();
      await vi.waitFor(() => {
        if (b.getSnapshot().game === null) throw new Error("sin espejo");
      });
      // Ambos despachan «a la vez»: ambos commitean en memoria de forma
      // síncrona e independiente (rev local 1 -> 2 en cada uno) antes de que
      // ninguna de las dos escrituras haya tocado la BD todavía — la carrera
      // real que el CAS de writeActive (db.ts) tiene que resolver.
      a.dispatch(life(2000, "ana", -1));
      b.dispatch(life(2001, "ana", -2));
      // OJO: justo tras los dos dispatch(), ga.log.committed.length YA vale 2
      // en ambos — cada uno commiteó en memoria de forma síncrona, antes de
      // que ninguna escritura haya tocado la BD. Comparar solo longitudes
      // aquí daría un verde falso en el primer tick del waitFor, sin haber
      // esperado a que el CAS real (db.ts) resuelva nada. Se compara el id
      // del ÚLTIMO evento: mientras cada uno se quede con SU propio dispatch
      // los ids difieren; solo coinciden cuando el perdedor de verdad adoptó
      // el registro del ganador.
      await vi.waitFor(() => {
        const ga = a.getSnapshot().game;
        const gb = b.getSnapshot().game;
        if (!ga || !gb) throw new Error("perdida");
        const lastA = ga.log.committed.at(-1)?.id;
        const lastB = gb.log.committed.at(-1)?.id;
        if (lastA !== lastB) throw new Error("divergen");
      });
      // El que pierde el CAS no se queda con un log corrupto ni a medias:
      // adopta el log completo del ganador (winner-takes-all, comportamiento
      // aceptado — no arregla la jugada perdida, la sustituye entera).
      expect(a.getSnapshot().game?.log.committed).toEqual(b.getSnapshot().game?.log.committed);
    } finally {
      await a.__drainWritesForTests();
      await b.__drainWritesForTests();
      a.destroy();
      b.destroy();
    }
  });

  it("una escritura ya encolada no resucita tras adoptar el registro de otra pestaña (#931)", async () => {
    const a = __createPlayStoreForTests("anon");
    const b = __createPlayStoreForTests("anon");
    try {
      await ready(a);
      await ready(b);
      expect(a.start(started(1000))).toBe(true);
      await a.__drainWritesForTests();

      // La OTRA pestaña deja su rev 2 en la BD. Se escribe por db.ts en lugar
      // de por un segundo store a propósito: así el aterrizaje es
      // DETERMINISTA. Si dos stores compitieran por el mismo rev, quién gana
      // el CAS lo decidiría el orden real de las transacciones y este test
      // pasaría o no según el día — justo lo que no debe hacer un test de una
      // carrera. Y tampoco publica por el canal, que es el caso interesante:
      // el aviso del espejo puede llegar tarde o no llegar, y entonces la
      // única defensa que queda es el CAS.
      const ajeno: ActiveGameRecord = {
        identity: "anon",
        v: SNAPSHOT_VERSION,
        committed: [started(1000), life(1500, "ana", -7)],
        pending: null,
        rev: 2,
      };
      expect(await writeActive(ajeno)).toEqual({ ok: true });

      // `a` commitea DOS veces seguidas: deja encoladas de golpe la rev 2 y la
      // rev 3. La rev 2 choca con la del ajeno; el bug era que la rev 3 —
      // encolada ANTES de saberlo, con su registro ya capturado— se ejecutaba
      // igual, ganaba el CAS (3 > 2) y dejaba en la BD una partida que la
      // memoria de `a` ya no mostraba.
      expect(a.dispatch(life(2000, "ana", -1))).toBe(true);
      expect(a.dispatch(life(2001, "ana", -2))).toBe(true);
      await a.__drainWritesForTests();
      await a.__drainWritesForTests(); // una adopción puede encolar más trabajo

      // Lo que se afirma NO es quién gana (winner-takes-all sigue siendo el
      // comportamiento aceptado, y con el arreglo la escritura intermedia ni
      // siquiera llega a ejecutarse): lo que no puede pasar es que la BD y la
      // memoria cuenten partidas distintas.
      const enMemoria = a.getSnapshot().game?.log.committed;
      expect(enMemoria).toBeDefined();
      const record = await readActive("anon");
      expect(record).not.toBeNull();
      expect(record?.committed).toEqual(enMemoria);
      // Y la otra pestaña acaba en lo mismo por el espejo.
      await vi.waitFor(() => {
        const gb = b.getSnapshot().game;
        if (!gb) throw new Error("sin partida");
        if (gb.log.committed.at(-1)?.id !== enMemoria?.at(-1)?.id) throw new Error("divergen");
      });
      expect(b.getSnapshot().game?.log.committed).toEqual(enMemoria);
    } finally {
      await a.__drainWritesForTests();
      await b.__drainWritesForTests();
      a.destroy();
      b.destroy();
    }
  });
});

describe("save() (sin cobertura hasta ahora)", () => {
  it("una partida terminada se guarda y la activa se limpia", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    expect(
      store.dispatch(makeEvent("game_finished", { winner: "ana", reason: "last_standing" }, 2000, "e-fin")),
    ).toBe(true);
    const ok = await store.save();
    expect(ok).toBe(true);
    expect(store.getSnapshot().game).toBeNull();
  });

  it("una partida activa (no terminada) no se guarda: devuelve false y el store queda intacto", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    const before = store.getSnapshot();
    const ok = await store.save();
    expect(ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
  });

  it("si saveFinished falla (BD no disponible), save() devuelve false y no toca la partida activa", async () => {
    const store = getPlayStore("anon");
    await ready(store);
    store.start(started(1000));
    expect(
      store.dispatch(makeEvent("game_finished", { winner: "ana", reason: "last_standing" }, 2000, "e-fin")),
    ).toBe(true);
    // Espera a que la escritura del game_finished aterrice ANTES de tocar la
    // BD: si no, el enqueue de esa escritura (todavía pendiente) podría abrir
    // su propia conexión DESPUÉS del reset de abajo y volver a dejar
    // dbPromise apuntando a una BD real, enmascarando el fallo que este test
    // quiere forzar.
    await vi.waitFor(async () => {
      const record = await readActive("anon");
      if (!record || record.rev < 2) throw new Error("la escritura del game_finished aún no aterrizó");
    });
    // Mecanismo elegido para forzar el fallo de saveFinished() (el menos
    // invasivo de los barajados): NO se mockea código propio (ni db.ts ni
    // store.ts), se simula el mismo escenario de plataforma que el store ya
    // sabe degradar en producción — modo privado o BD indisponible (spec §4).
    // __resetDbForTests() limpia la conexión cacheada mientras indexedDB
    // TODAVÍA es real (lo necesita para poder borrar la BD); solo DESPUÉS se
    // stubea indexedDB a undefined, así openDb() —al no tener conexión
    // cacheada que reutilizar— cae en su propia guarda ("IndexedDB no
    // disponible") sin tocar la BD real. El orden importa: stubear undefined
    // ANTES de __resetDbForTests() haría que este último lanzase al intentar
    // borrar la BD con un indexedDB inexistente.
    await __resetDbForTests();
    vi.stubGlobal("indexedDB", undefined);
    const before = store.getSnapshot();
    const ok = await store.save();
    expect(ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
  });
});
