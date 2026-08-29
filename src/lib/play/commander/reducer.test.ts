import { describe, expect, it } from "vitest";
import { PlayEventError } from "@/lib/play/core/errors";
import { commanderReducer, initialCommanderState } from "./reducer";
import { ev, makeSetup, started } from "./test-fixtures";
import type { CommanderDamageEvent, LifeChangedEvent, PoisonChangedEvent } from "./events";

describe("initialCommanderState", () => {
  it("arranca con las vidas del setup, sin veneno y con el asiento inicial activo", () => {
    const s = initialCommanderState(started(1000));
    expect(s.status).toBe("active");
    expect(s.players).toHaveLength(4);
    expect(s.players.every((p) => p.life === 40 && p.poison === 0 && p.elimination === null)).toBe(true);
    expect(s.activeSeat).toBe(0);
    expect(s.round).toBe(1);
    expect(s.turnCount).toBe(0);
    expect(s.startedAt).toBe(1000);
  });

  it("rechaza menos de 2 o más de 6 jugadores y los ids duplicados", () => {
    expect(() => initialCommanderState(started(1, makeSetup(["ana"])))).toThrow(PlayEventError);
    expect(() => initialCommanderState(started(1, makeSetup(["a", "b", "c", "d", "e", "f", "g"])))).toThrow(PlayEventError);
    expect(() => initialCommanderState(started(1, makeSetup(["ana", "ana"])))).toThrow(PlayEventError);
  });
});

describe("commanderReducer — contadores", () => {
  const base = initialCommanderState(started(1000));

  it("life_changed suma y resta (sin suelo: vidas negativas existen)", () => {
    let s = commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -45 }, 2000));
    expect(s.players[0].life).toBe(-5);
    s = commanderReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 3 }, 2100));
    expect(s.players[0].life).toBe(-2);
  });

  it("commander_damage baja vidas Y acumula daño del atacante en UN evento (spec §3)", () => {
    const s = commanderReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 5 }, 2000),
    );
    expect(s.players[1].life).toBe(35);
    expect(s.players[1].commanderDamage).toEqual({ carlos: 5 });
    // el atacante no cambia
    expect(s.players[2].life).toBe(40);
  });

  it("poison_changed acumula y no baja de 0", () => {
    let s = commanderReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "laura", delta: 2 }, 2000));
    s = commanderReducer(s, ev<PoisonChangedEvent>("poison_changed", { target: "laura", delta: -5 }, 2100));
    expect(s.players[3].poison).toBe(0);
  });

  it("rechaza participantes desconocidos y game_started duplicado", () => {
    expect(() => commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "nadie", delta: 1 }, 2000)))
      .toThrow(PlayEventError);
    expect(() => commanderReducer(base, started(2000))).toThrow(PlayEventError);
  });

  it("acumula daño de comandante en múltiples golpes del mismo atacante", () => {
    // Verificar que (tally ?? 0) + delta acumula y no sobrescribe
    let s = commanderReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 5 }, 2000),
    );
    expect(s.players[1].commanderDamage).toEqual({ carlos: 5 });
    expect(s.players[1].life).toBe(35);

    s = commanderReducer(
      s,
      ev<CommanderDamageEvent>("commander_damage", { source: "carlos", target: "borja", delta: 8 }, 2100),
    );
    expect(s.players[1].commanderDamage).toEqual({ carlos: 13 });
    expect(s.players[1].life).toBe(27);
  });

  it("rechaza atacante desconocido en commander_damage", () => {
    expect(() =>
      commanderReducer(
        base,
        ev<CommanderDamageEvent>("commander_damage", { source: "fantasma", target: "borja", delta: 5 }, 2000),
      ),
    ).toThrow(PlayEventError);
  });

  it("rechaza eventos cuando la partida está cerrada", () => {
    const finished = { ...base, status: "finished" as const };
    expect(() =>
      commanderReducer(finished, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: 1 }, 2000)),
    ).toThrow(PlayEventError);
  });

  it("rechaza asiento inicial fuera de rango en initialCommanderState", () => {
    expect(() =>
      initialCommanderState(started(1000, { ...makeSetup(), startingSeat: 9 })),
    ).toThrow(PlayEventError);
  });
});
