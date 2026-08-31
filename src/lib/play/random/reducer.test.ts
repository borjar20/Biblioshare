import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import {
  COMPACT_KEEP,
  COMPACT_THRESHOLD,
  compactIfNeeded,
  initialRandomState,
  randomReducer,
  replayRandom,
} from "./reducer";
import { describeRandomEvent, RESULT_EVENT_TYPES } from "./selectors";
import type { RandomEvent } from "./events";

const t0 = 1000;
const dice = (results: number[], sides = 6) =>
  makeEvent("dice_rolled", { count: results.length, sides, results }, t0) as RandomEvent;
const bagSet = (items: { name: string; count: number }[], withReplacement = false) =>
  makeEvent("bag_set", { items, withReplacement }, t0) as RandomEvent;
const bagDrawn = (name: string) => makeEvent("bag_drawn", { name }, t0) as RandomEvent;

describe("randomReducer — eventos de resultado", () => {
  it("dice_rolled coherente no cambia el estado", () => {
    const s = initialRandomState();
    expect(randomReducer(s, dice([4, 2, 6]))).toBe(s);
  });
  it("dice_rolled con results incoherentes lanza", () => {
    const s = initialRandomState();
    expect(() => randomReducer(s, { ...dice([4, 2]), payload: { count: 3, sides: 6, results: [4, 2] } } as RandomEvent)).toThrow();
    expect(() => randomReducer(s, { ...dice([7]), payload: { count: 1, sides: 6, results: [7] } } as RandomEvent)).toThrow();
    expect(() => randomReducer(s, { ...dice([0]), payload: { count: 1, sides: 6, results: [0] } } as RandomEvent)).toThrow();
  });
  it("dice_rolled valida los límites de count y sides en el propio payload", () => {
    // Caza al mutante que relaja los rangos del reducer (el log no se fía de la UI).
    const s = initialRandomState();
    expect(() => randomReducer(s, { ...dice([1]), payload: { count: 0, sides: 6, results: [] } } as RandomEvent)).toThrow();
    expect(() => randomReducer(s, { ...dice([1]), payload: { count: 21, sides: 6, results: Array(21).fill(1) } } as RandomEvent)).toThrow();
    expect(() => randomReducer(s, { ...dice([1]), payload: { count: 1, sides: 1, results: [1] } } as RandomEvent)).toThrow();
    expect(() => randomReducer(s, { ...dice([1]), payload: { count: 1, sides: 1001, results: [1] } } as RandomEvent)).toThrow();
  });
  it("first_picked exige picked dentro de players y al menos 2", () => {
    const s = initialRandomState();
    const ok = makeEvent("first_picked", { players: ["a", "b"], picked: "a" }, t0) as RandomEvent;
    expect(randomReducer(s, ok)).toBe(s);
    const fuera = makeEvent("first_picked", { players: ["a", "b"], picked: "z" }, t0) as RandomEvent;
    expect(() => randomReducer(s, fuera)).toThrow();
    const solo = makeEvent("first_picked", { players: ["a"], picked: "a" }, t0) as RandomEvent;
    expect(() => randomReducer(s, solo)).toThrow();
  });
  it("order_drawn debe ser permutación exacta de players", () => {
    const s = initialRandomState();
    const ok = makeEvent("order_drawn", { players: ["a", "b"], order: ["b", "a"] }, t0) as RandomEvent;
    expect(randomReducer(s, ok)).toBe(s);
    const mal = makeEvent("order_drawn", { players: ["a", "b"], order: ["b", "b"] }, t0) as RandomEvent;
    expect(() => randomReducer(s, mal)).toThrow();
  });
  it("teams_drawn debe ser partición exacta con 2..n-1 equipos", () => {
    const s = initialRandomState();
    const ok = makeEvent(
      "teams_drawn",
      { players: ["a", "b", "c"], teams: [["a", "c"], ["b"]] },
      t0,
    ) as RandomEvent;
    expect(randomReducer(s, ok)).toBe(s);
    const repite = makeEvent(
      "teams_drawn",
      { players: ["a", "b", "c"], teams: [["a", "a"], ["b"]] },
      t0,
    ) as RandomEvent;
    expect(() => randomReducer(s, repite)).toThrow();
    const unEquipo = makeEvent(
      "teams_drawn",
      { players: ["a", "b", "c"], teams: [["a", "b", "c"]] },
      t0,
    ) as RandomEvent;
    expect(() => randomReducer(s, unEquipo)).toThrow();
  });
});

describe("randomReducer — jugadores y bolsa", () => {
  it("players_set guarda nombres recortados y rechaza vacíos y duplicados", () => {
    const s = initialRandomState();
    const next = randomReducer(s, makeEvent("players_set", { players: ["Ana", "Beto"] }, t0) as RandomEvent);
    expect(next.players).toEqual(["Ana", "Beto"]);
    expect(() =>
      randomReducer(s, makeEvent("players_set", { players: ["Ana", ""] }, t0) as RandomEvent),
    ).toThrow();
    expect(() =>
      randomReducer(s, makeEvent("players_set", { players: ["Ana", "Ana"] }, t0) as RandomEvent),
    ).toThrow();
  });
  it("bag_set fija items e initial a la misma foto", () => {
    const s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 2 }]));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 2 }]);
    expect(s.bag.initial).toEqual([{ name: "Rojo", count: 2 }]);
    expect(s.bag.withReplacement).toBe(false);
  });
  it("bag_set rechaza nombres vacíos, duplicados y counts no positivos", () => {
    const s = initialRandomState();
    expect(() => randomReducer(s, bagSet([{ name: "", count: 1 }]))).toThrow();
    expect(() =>
      randomReducer(s, bagSet([{ name: "Rojo", count: 1 }, { name: "Rojo", count: 2 }])),
    ).toThrow();
    expect(() => randomReducer(s, bagSet([{ name: "Rojo", count: 0 }]))).toThrow();
    expect(() => randomReducer(s, bagSet([{ name: "Rojo", count: 1.5 }]))).toThrow();
  });
  it("bag_drawn sin reemplazo descuenta; a 0 lanza", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 1 }]));
    s = randomReducer(s, bagDrawn("Rojo"));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 0 }]);
    expect(s.bag.initial).toEqual([{ name: "Rojo", count: 1 }]); // initial no se toca
    expect(() => randomReducer(s, bagDrawn("Rojo"))).toThrow();
    expect(() => randomReducer(s, bagDrawn("Verde"))).toThrow();
  });
  it("bag_drawn con reemplazo no descuenta", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 1 }], true));
    s = randomReducer(s, bagDrawn("Rojo"));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 1 }]);
  });
  it("reiniciar = bag_set con initial: restaura restantes", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 2 }]));
    s = randomReducer(s, bagDrawn("Rojo"));
    s = randomReducer(s, bagSet(s.bag.initial, s.bag.withReplacement));
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 2 }]);
  });
  it("cleared vuelve al estado inicial", () => {
    let s = randomReducer(initialRandomState(), bagSet([{ name: "Rojo", count: 2 }]));
    s = randomReducer(s, makeEvent("players_set", { players: ["Ana", "Beto"] }, t0) as RandomEvent);
    s = randomReducer(s, makeEvent("cleared", {}, t0) as RandomEvent);
    expect(s).toEqual(initialRandomState());
  });
});

describe("replayRandom", () => {
  it("replay determinista de un log mixto", () => {
    const log: PlayEvent[] = [
      makeEvent("players_set", { players: ["Ana", "Beto"] }, t0),
      dice([4, 2, 6]),
      bagSet([{ name: "Rojo", count: 2 }]),
      bagDrawn("Rojo"),
    ];
    const s = replayRandom(null, log);
    expect(s.players).toEqual(["Ana", "Beto"]);
    expect(s.bag.items).toEqual([{ name: "Rojo", count: 1 }]);
  });
  it("evento desconocido en el log lanza (log corrupto se descarta, no se arrastra)", () => {
    const log: PlayEvent[] = [makeEvent("intruso", { x: 1 }, t0)];
    expect(() => replayRandom(null, log)).toThrow();
  });
  it("arranca desde base si la hay", () => {
    const base = replayRandom(null, [bagSet([{ name: "Azul", count: 3 }])]);
    const s = replayRandom(base, [bagDrawn("Azul")]);
    expect(s.bag.items).toEqual([{ name: "Azul", count: 2 }]);
  });
});

describe("compactIfNeeded", () => {
  it("bajo el umbral no toca nada", () => {
    const input = { base: null, log: [dice([1])] as PlayEvent[] };
    expect(compactIfNeeded(input)).toBe(input);
  });
  it("sobre el umbral re-basa y conserva la cola; el estado replayado es idéntico", () => {
    const log: PlayEvent[] = [bagSet([{ name: "Rojo", count: COMPACT_THRESHOLD + 10 }])];
    for (let i = 0; i < COMPACT_THRESHOLD; i++) log.push(bagDrawn("Rojo"));
    const before = replayRandom(null, log);
    const compacted = compactIfNeeded({ base: null, log });
    expect(compacted.log).toHaveLength(COMPACT_KEEP);
    expect(replayRandom(compacted.base, compacted.log)).toEqual(before);
  });
});

describe("describeRandomEvent", () => {
  it("etiqueta dados con expresión y total", () => {
    const d = describeRandomEvent(dice([4, 2, 6]) as RandomEvent);
    expect(d.key).toBe("dice");
    expect(d.params).toEqual({ expr: "3d6", rolls: "4 + 2 + 6", total: 12 });
  });
  it("un solo dado omite la suma redundante en rolls", () => {
    const d = describeRandomEvent(dice([5]) as RandomEvent);
    expect(d.params).toEqual({ expr: "1d6", rolls: "5", total: 5 });
  });
  it("etiqueta el resto de resultados", () => {
    expect(describeRandomEvent(makeEvent("coin_flipped", { result: "heads" as const }, t0) as RandomEvent).key).toBe("coinHeads");
    expect(describeRandomEvent(makeEvent("coin_flipped", { result: "tails" as const }, t0) as RandomEvent).key).toBe("coinTails");
    const first = describeRandomEvent(
      makeEvent("first_picked", { players: ["a", "b"], picked: "b" }, t0) as RandomEvent,
    );
    expect(first).toEqual({ key: "first", params: { picked: "b" } });
    const order = describeRandomEvent(
      makeEvent("order_drawn", { players: ["a", "b"], order: ["b", "a"] }, t0) as RandomEvent,
    );
    expect(order).toEqual({ key: "order", params: { order: "b, a" } });
    const teams = describeRandomEvent(
      makeEvent("teams_drawn", { players: ["a", "b", "c"], teams: [["a"], ["b", "c"]] }, t0) as RandomEvent,
    );
    expect(teams).toEqual({ key: "teams", params: { teams: "a — b, c" } });
    const drawn = describeRandomEvent(bagDrawn("Rojo") as RandomEvent);
    expect(drawn).toEqual({ key: "bagDrawn", params: { name: "Rojo" } });
  });
  it("RESULT_EVENT_TYPES contiene exactamente los 6 eventos de resultado", () => {
    expect([...RESULT_EVENT_TYPES].sort()).toEqual(
      ["bag_drawn", "coin_flipped", "dice_rolled", "first_picked", "order_drawn", "teams_drawn"].sort(),
    );
  });
});
