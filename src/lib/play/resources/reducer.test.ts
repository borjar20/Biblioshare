import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import { initialResourcesState, type ResourcesState } from "./types";
import type { ResourcesEvent } from "./events";
import {
  compactResourcesIfNeeded,
  replayResources,
  resourcesReducer,
  RESOURCES_COMPACT_THRESHOLD,
} from "./reducer";
import { valueOf } from "./selectors";

const t0 = 1000;
const ev = <T extends ResourcesEvent["type"]>(
  type: T,
  payload: Extract<ResourcesEvent, { type: T }>["payload"],
) => makeEvent(type, payload, t0) as ResourcesEvent;

const players = (names: string[]) => ev("players_set", { players: names });
const addRes = (name: string, initial = 0, shared = false, emoji = "") =>
  ev("resource_added", { name, emoji, initial, shared });
const adjust = (resource: string, owner: string | null, delta: number) =>
  ev("adjusted", { resource, owner, delta });
const update = (name: string, initial: number, shared: boolean) =>
  ev("resource_updated", { name, initial, shared });

function run(events: ResourcesEvent[], base: ResourcesState | null = null): ResourcesState {
  return events.reduce(resourcesReducer, base ?? initialResourcesState());
}

describe("resource_added / resource_removed — reconciliación", () => {
  it("crea values a initial por jugador, y una sola para compartidos", () => {
    const s = run([players(["Ana", "Beto"]), addRes("Madera", 5), addRes("Oro", 3, true)]);
    expect(valueOf(s, "Madera", "Ana")).toBe(5);
    expect(valueOf(s, "Madera", "Beto")).toBe(5);
    expect(valueOf(s, "Oro", null)).toBe(3);
    expect(s.values).toHaveLength(3);
  });
  it("quitar un recurso borra sus values y deja el resto intacto", () => {
    const s = run([
      players(["Ana"]),
      addRes("Madera", 5),
      addRes("Oro", 3, true),
      ev("resource_removed", { name: "Madera" }),
    ]);
    expect(valueOf(s, "Madera", "Ana")).toBeNull();
    expect(valueOf(s, "Oro", null)).toBe(3);
  });
  it("rechaza duplicados, vacíos, novena def y rangos", () => {
    const s = run([addRes("Oro", 0, true)]);
    expect(() => resourcesReducer(s, addRes("Oro", 1, true))).toThrow();
    expect(() => resourcesReducer(s, addRes("  ", 0))).toThrow();
    expect(() => resourcesReducer(s, addRes("X", 10_000))).toThrow();
    expect(() => resourcesReducer(s, addRes("X", -10_000))).toThrow();
    const eight = run(
      Array.from({ length: 8 }, (_, i) => addRes(`r${i}`, 0, true)),
    );
    expect(() => resourcesReducer(eight, addRes("r8", 0, true))).toThrow();
    expect(() =>
      resourcesReducer(s, ev("resource_removed", { name: "NoExiste" })),
    ).toThrow();
  });
  it("acepta los extremos exactos de initial", () => {
    const s = run([addRes("Max", 9_999, true), addRes("Min", -9_999, true)]);
    expect(valueOf(s, "Max", null)).toBe(9_999);
    expect(valueOf(s, "Min", null)).toBe(-9_999);
  });
  it("emoji: acepta 8 unidades y rechaza 9", () => {
    const s = run([
      makeEvent(
        "resource_added",
        { name: "Ok", emoji: "12345678", initial: 0, shared: true },
        t0,
      ) as ResourcesEvent,
    ]);
    expect(s.defs[0].emoji).toBe("12345678");
    expect(() =>
      resourcesReducer(
        initialResourcesState(),
        makeEvent(
          "resource_added",
          { name: "No", emoji: "123456789", initial: 0, shared: true },
          t0,
        ) as ResourcesEvent,
      ),
    ).toThrow();
  });
});

describe("players_set — reconciliación por nombre", () => {
  it("quien permanece conserva su valor; el nuevo entra a initial; el que sale se borra", () => {
    const s = run([
      players(["Ana", "Beto"]),
      addRes("Madera", 5),
      adjust("Madera", "Ana", 7),
      players(["Ana", "Carla"]),
    ]);
    expect(valueOf(s, "Madera", "Ana")).toBe(12);
    expect(valueOf(s, "Madera", "Carla")).toBe(5);
    expect(valueOf(s, "Madera", "Beto")).toBeNull();
  });
  it("lista vacía es válida (solo banco); 7 jugadores o duplicados lanzan", () => {
    expect(run([players([])]).players).toEqual([]);
    expect(() =>
      run([players(["a", "b", "c", "d", "e", "f", "g"])]),
    ).toThrow();
    expect(() => run([players(["Ana", "Ana"])])).toThrow();
    expect(() => run([players(["Ana", " "])])).toThrow();
  });
  it("acepta exactamente 6 jugadores (caza el mutante > vs >=)", () => {
    expect(run([players(["a", "b", "c", "d", "e", "f"])]).players).toHaveLength(6);
  });
});

describe("adjusted — clamp y validación", () => {
  it("suma y clampa en ambos extremos", () => {
    const s = run([addRes("Oro", 9_990, true), adjust("Oro", null, 500)]);
    expect(valueOf(s, "Oro", null)).toBe(9_999);
    const s2 = run([addRes("Deuda", -9_990, true), adjust("Deuda", null, -500)]);
    expect(valueOf(s2, "Deuda", null)).toBe(-9_999);
  });
  it("rechaza delta 0, no entero, fuera de rango, y combinaciones inexistentes", () => {
    const s = run([players(["Ana"]), addRes("Madera", 0), addRes("Oro", 0, true)]);
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", 0))).toThrow();
    // Extremo exacto valido del delta (caza el mutante > vs >=).
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", 9_999))).not.toThrow();
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", -9_999))).not.toThrow();
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", 1.5))).toThrow();
    expect(() => resourcesReducer(s, adjust("Madera", "Ana", 10_000))).toThrow();
    expect(() => resourcesReducer(s, adjust("NoExiste", "Ana", 1))).toThrow();
    expect(() => resourcesReducer(s, adjust("Madera", "Zoe", 1))).toThrow(); // jugador ajeno
    expect(() => resourcesReducer(s, adjust("Madera", null, 1))).toThrow(); // no compartido sin owner
    expect(() => resourcesReducer(s, adjust("Oro", "Ana", 1))).toThrow(); // compartido con owner
  });
});

describe("values_reset y cleared", () => {
  it("reset vuelve todo a initial con la config intacta", () => {
    const s = run([
      players(["Ana"]),
      addRes("Madera", 5),
      adjust("Madera", "Ana", 7),
      ev("values_reset", {}),
    ]);
    expect(valueOf(s, "Madera", "Ana")).toBe(5);
    expect(s.defs).toHaveLength(1);
  });
  it("reset sin defs lanza; cleared vacía todo y undo lo recupera vía log", () => {
    expect(() => run([ev("values_reset", {})])).toThrow();
    const log: ResourcesEvent[] = [players(["Ana"]), addRes("Madera", 5), ev("cleared", {})];
    expect(replayResources(null, log)).toEqual(initialResourcesState());
    expect(valueOf(replayResources(null, log.slice(0, -1)), "Madera", "Ana")).toBe(5);
  });
});

describe("resource_updated", () => {
  it("cambia la definición y conserva los valores que ya había", () => {
    const s = run([players(["Ana"]), addRes("Madera", 5), adjust("Madera", "Ana", 2), update("Madera", 9, false)]);
    expect(s.defs[0]).toEqual({ name: "Madera", emoji: "", initial: 9, shared: false });
    expect(valueOf(s, "Madera", "Ana")).toBe(7);
  });
  it("pasar a banco reconcilia: una sola entrada compartida a initial", () => {
    const s = run([players(["Ana", "Beto"]), addRes("Oro", 1), update("Oro", 3, true)]);
    expect(s.values).toEqual([{ resource: "Oro", owner: null, value: 3 }]);
  });
  it("values_reset aplica el nuevo inicial", () => {
    const s = run([players(["Ana"]), addRes("Madera", 5), update("Madera", 9, false), ev("values_reset", {})]);
    expect(valueOf(s, "Madera", "Ana")).toBe(9);
  });
  it("recurso inexistente o initial fuera de rango lanza", () => {
    const base = run([players(["Ana"]), addRes("Madera", 5)]);
    expect(() => resourcesReducer(base, update("Oro", 1, false))).toThrow("recurso inexistente");
    expect(() => resourcesReducer(base, update("Madera", -10_000, false))).toThrow("initial fuera de rango");
  });
});

describe("replay y compactación", () => {
  it("replay rechaza eventos desconocidos", () => {
    const alien = makeEvent("dice_rolled", { count: 1, sides: 6, results: [1] }, t0) as PlayEvent;
    expect(() => replayResources(null, [alien])).toThrow();
  });
  it("compactación re-basa conservando el estado", () => {
    const log: ResourcesEvent[] = [players(["Ana"]), addRes("Madera", 0)];
    for (let i = 0; i < RESOURCES_COMPACT_THRESHOLD; i++) log.push(adjust("Madera", "Ana", 1));
    const before = replayResources(null, log);
    const compacted = compactResourcesIfNeeded({ base: null, log });
    expect(compacted.log.length).toBeLessThan(log.length);
    expect(replayResources(compacted.base, compacted.log)).toEqual(before);
  });
});
