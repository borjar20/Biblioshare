import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import { initialTurnsState, type TurnsState } from "./types";
import type { TurnsEvent } from "./events";
import {
  compactTurnsIfNeeded,
  replayTurns,
  turnsReducer,
  TURNS_COMPACT_THRESHOLD,
} from "./reducer";
import { aliveCount, nextAlive } from "./selectors";

const t0 = 1000;
const ev = <T extends TurnsEvent["type"]>(
  type: T,
  payload: Extract<TurnsEvent, { type: T }>["payload"],
) => makeEvent(type, payload, t0) as TurnsEvent;

const cfg = (players = ["Ana", "Beto", "Carla"], phases: string[] = []) =>
  ev("turns_configured", { players, phases });

function run(events: TurnsEvent[], base: TurnsState | null = null): TurnsState {
  return events.reduce(turnsReducer, base ?? initialTurnsState());
}

describe("turns_configured", () => {
  it("arranca en el primero, ronda 1, dirección 1", () => {
    const s = run([cfg(["Ana", "Beto"], ["Mantenimiento", "Acción"])]);
    expect(s).toMatchObject({ active: 0, phase: 0, round: 1, direction: 1, eliminated: [] });
    expect(s.phases).toEqual(["Mantenimiento", "Acción"]);
  });
  it("rechaza jugadores y fases inválidos", () => {
    const s = initialTurnsState();
    expect(() => turnsReducer(s, cfg(["Ana"]))).toThrow();
    expect(() => turnsReducer(s, cfg(["Ana", "Ana"]))).toThrow();
    expect(() => turnsReducer(s, cfg(["Ana", " "]))).toThrow();
    expect(() =>
      turnsReducer(s, cfg(["a", "b", "c", "d", "e", "f", "g", "h", "i"])),
    ).toThrow();
    expect(() => turnsReducer(s, cfg(["Ana", "Beto"], ["F", "F"]))).toThrow();
    expect(() =>
      turnsReducer(s, cfg(["Ana", "Beto"], ["1", "2", "3", "4", "5", "6", "7"])),
    ).toThrow();
  });
  it("acepta los extremos exactos (8 jugadores, 6 fases)", () => {
    const s = run([
      cfg(["a", "b", "c", "d", "e", "f", "g", "h"], ["1", "2", "3", "4", "5", "6"]),
    ]);
    expect(s.players).toHaveLength(8);
    expect(s.phases).toHaveLength(6);
  });
});

describe("turn_advanced — dirección, eliminados y ronda envolvente", () => {
  it("avanza y la ronda sube al envolver (dir 1)", () => {
    let s = run([cfg()]);
    s = turnsReducer(s, ev("turn_advanced", {})); // Beto
    expect(s).toMatchObject({ active: 1, round: 1 });
    s = turnsReducer(s, ev("turn_advanced", {})); // Carla
    s = turnsReducer(s, ev("turn_advanced", {})); // Ana: envuelve
    expect(s).toMatchObject({ active: 0, round: 2 });
  });
  it("con dirección invertida envuelve hacia el otro lado", () => {
    let s = run([cfg(), ev("direction_toggled", {})]);
    s = turnsReducer(s, ev("turn_advanced", {})); // de Ana (0) a Carla (2): envuelve
    expect(s).toMatchObject({ active: 2, round: 2, direction: -1 });
    // Y de Carla (2) a Beto (1) hacia atrás NO envuelve (rama next < active).
    s = turnsReducer(s, ev("turn_advanced", {}));
    expect(s).toMatchObject({ active: 1, round: 2 });
  });
  it("acepta el mínimo exacto (2 jugadores) y alterna con ronda por vuelta", () => {
    let s = run([cfg(["Ana", "Beto"])]);
    expect(s.players).toHaveLength(2);
    s = turnsReducer(s, ev("turn_advanced", {}));
    expect(s).toMatchObject({ active: 1, round: 1 });
    s = turnsReducer(s, ev("turn_advanced", {}));
    expect(s).toMatchObject({ active: 0, round: 2 });
  });
  it("salta eliminados y resetea la fase", () => {
    let s = run([
      cfg(["Ana", "Beto", "Carla"], ["F1", "F2"]),
      ev("player_eliminated", { name: "Beto" }),
      ev("phase_advanced", {}),
    ]);
    expect(s.phase).toBe(1);
    s = turnsReducer(s, ev("turn_advanced", {}));
    expect(s.active).toBe(2); // Beto saltado
    expect(s.phase).toBe(0);
  });
  it("sin configurar o con <2 vivos lanza", () => {
    expect(() => turnsReducer(initialTurnsState(), ev("turn_advanced", {}))).toThrow();
  });
});

describe("turn_skipped", () => {
  it("equivale a dos avances (rondas incluidas)", () => {
    let s = run([cfg(["Ana", "Beto"])]);
    s = turnsReducer(s, ev("turn_skipped", {})); // Beto pierde: Ana→Beto→Ana, envuelve una vez
    expect(s).toMatchObject({ active: 0, round: 2 });
    // Desde el último asiento el salto envuelve UNA vez: con la regla
    // posicional, dos envolturas consecutivas son imposibles (cada envoltura
    // aterriza en el mínimo vivo y el siguiente avance siempre sube).
    s = turnsReducer(s, ev("turn_advanced", {})); // a Beto (último), sin envolver
    s = turnsReducer(s, ev("turn_skipped", {})); // Beto→Ana (envuelve)→Beto
    expect(s).toMatchObject({ active: 1, round: 3 });
  });
});

describe("phase_advanced", () => {
  it("avanza y en la última lanza (la UI encadena turn_advanced)", () => {
    let s = run([cfg(["Ana", "Beto"], ["F1", "F2"])]);
    s = turnsReducer(s, ev("phase_advanced", {}));
    expect(s.phase).toBe(1);
    expect(() => turnsReducer(s, ev("phase_advanced", {}))).toThrow();
  });
  it("sin fases lanza", () => {
    const s = run([cfg(["Ana", "Beto"])]);
    expect(() => turnsReducer(s, ev("phase_advanced", {}))).toThrow();
  });
});

describe("eliminar y restaurar", () => {
  it("eliminar al activo avanza primero; restaurar devuelve el asiento", () => {
    let s = run([cfg()]);
    s = turnsReducer(s, ev("player_eliminated", { name: "Ana" }));
    expect(s.active).toBe(1);
    expect(s.eliminated).toEqual(["Ana"]);
    s = turnsReducer(s, ev("player_restored", { name: "Ana" }));
    expect(s.eliminated).toEqual([]);
    expect(aliveCount(s)).toBe(3);
  });
  it("no deja bajar de 2 vivos ni tocar inexistentes", () => {
    let s = run([cfg(), ev("player_eliminated", { name: "Carla" })]);
    expect(() => turnsReducer(s, ev("player_eliminated", { name: "Beto" }))).toThrow();
    expect(() => turnsReducer(s, ev("player_eliminated", { name: "Zoe" }))).toThrow();
    expect(() => turnsReducer(s, ev("player_eliminated", { name: "Carla" }))).toThrow();
    expect(() => turnsReducer(s, ev("player_restored", { name: "Ana" }))).toThrow();
  });
});

describe("turns_reset y cleared", () => {
  it("reset conserva players/phases y vuelve a sin-configurar", () => {
    const s = run([
      cfg(["Ana", "Beto"], ["F1"]),
      ev("turn_advanced", {}),
      ev("turns_reset", {}),
    ]);
    expect(s).toMatchObject({ active: null, round: 1, direction: 1, eliminated: [] });
    expect(s.players).toEqual(["Ana", "Beto"]);
    expect(s.phases).toEqual(["F1"]);
  });
  it("reset sin configurar lanza; cleared vacía todo", () => {
    expect(() => run([ev("turns_reset", {})])).toThrow();
    expect(run([cfg(), ev("cleared", {})])).toEqual(initialTurnsState());
  });
});

describe("nextAlive", () => {
  it("recorre vivos en ambas direcciones", () => {
    const s = run([cfg(["a", "b", "c", "d"]), ev("player_eliminated", { name: "b" })]);
    expect(nextAlive(s, 0, 1)).toBe(2);
    expect(nextAlive(s, 2, -1)).toBe(0);
    expect(nextAlive(s, 0, -1)).toBe(3);
  });
});

describe("replay y compactación", () => {
  it("replay rechaza eventos desconocidos", () => {
    const alien = makeEvent("dice_rolled", { count: 1, sides: 6, results: [1] }, t0) as PlayEvent;
    expect(() => replayTurns(null, [alien])).toThrow();
  });
  it("compactación re-basa conservando el estado", () => {
    const log: TurnsEvent[] = [cfg()];
    for (let i = 0; i < TURNS_COMPACT_THRESHOLD; i++) log.push(ev("turn_advanced", {}));
    const before = replayTurns(null, log);
    const compacted = compactTurnsIfNeeded({ base: null, log });
    expect(compacted.log.length).toBeLessThan(log.length);
    expect(replayTurns(compacted.base, compacted.log)).toEqual(before);
  });
});
