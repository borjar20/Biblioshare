import { describe, expect, it } from "vitest";
import { PlayEventError } from "@/lib/play/core/errors";
import { initialMtgState, mtgReducer } from "./reducer";
import { lossConditions, commanderDamageBreakdown } from "./rules";
import { ev, guest, guestWithPartner, makeSetup, started } from "./test-fixtures";
import { MTG_MODES, MTG_MODE_IDS } from "./modes";
import type { CommanderDamageEvent, PoisonChangedEvent } from "./events";

describe("modos", () => {
  it("cada modo declara su fila completa y el id sale de la tabla", () => {
    expect(MTG_MODE_IDS).toEqual(["commander", "duel"]);
    expect(MTG_MODES.commander.startingLife).toBe(40);
    expect(MTG_MODES.duel.startingLife).toBe(20);
  });

  it("el modo fija cuánta gente cabe: Duelo son exactamente 2", () => {
    expect(() => initialMtgState(started(1000, makeSetup(["ana", "borja"], "duel")))).not.toThrow();
    expect(() => initialMtgState(started(1000, makeSetup(["ana", "borja", "carlos"], "duel")))).toThrow(PlayEventError);
    // Commander sí admite 3
    expect(() => initialMtgState(started(1000, makeSetup(["ana", "borja", "carlos"])))).not.toThrow();
  });

  it("Duelo rechaza commander_damage: el modo no lo lleva", () => {
    const duel = initialMtgState(started(1000, makeSetup(["ana", "borja"], "duel")));
    expect(() =>
      mtgReducer(duel, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "borja", delta: 5 }, 2000)),
    ).toThrow(PlayEventError);
  });

  it("Duelo no reporta commander_damage como condición, pero el veneno sigue siendo regla general", () => {
    let duel = initialMtgState(started(1000, makeSetup(["ana", "borja"], "duel")));
    duel = mtgReducer(duel, ev<PoisonChangedEvent>("poison_changed", { target: "borja", delta: 10 }, 2000));
    expect(lossConditions(duel, "borja")).toEqual(["poison"]);
    expect(commanderDamageBreakdown(duel, "borja")).toEqual([]);
  });

  it("Duelo admite un solo comandante por asiento", () => {
    const setup = { ...makeSetup(["ana", "borja"], "duel"), participants: [guestWithPartner("ana"), guest("borja")] };
    expect(() => initialMtgState(started(1000, setup))).toThrow(PlayEventError);
  });
});

describe("partner: el daño se cuenta por comandante", () => {
  const setup = { ...makeSetup(), participants: [guestWithPartner("ana"), guest("borja"), guest("carlos"), guest("laura")] };
  const base = initialMtgState(started(1000, setup));

  it("dos comandantes del MISMO jugador no suman contra el umbral de 21", () => {
    // 15 + 15 = 30 recibidos de Ana, pero de comandantes distintos: sigue viva.
    let s = mtgReducer(base, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "borja", delta: 15 }, 2000));
    s = mtgReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c2", target: "borja", delta: 15 }, 2100));

    expect(s.players[1].commanderDamage).toEqual({ "ana-c1": 15, "ana-c2": 15 });
    expect(lossConditions(s, "borja")).toEqual([]); // 40 - 30 = 10 vidas, y ningún comandante llega a 21
  });

  it("21 de UNO SOLO sí dispara la condición", () => {
    let s = mtgReducer(base, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "carlos", delta: 20 }, 2000));
    expect(lossConditions(s, "carlos")).toEqual([]);
    s = mtgReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "carlos", delta: 1 }, 2100));
    expect(lossConditions(s, "carlos")).toEqual(["commander_damage"]);
  });

  it("rechaza un comandante que no existe y el daño de un comandante a su propio dueño", () => {
    expect(() =>
      mtgReducer(base, ev<CommanderDamageEvent>("commander_damage", { source: "fantasma-c1", target: "borja", delta: 5 }, 2000)),
    ).toThrow(PlayEventError);
    expect(() =>
      mtgReducer(base, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "ana", delta: 5 }, 2000)),
    ).toThrow(PlayEventError);
  });

  it("ids de comandante duplicados entre asientos no arrancan: mezclarían dos contadores", () => {
    const clashing = {
      ...makeSetup(),
      participants: [
        { id: "ana", kind: "guest" as const, name: "ana", commanders: [{ id: "dup" }] },
        { id: "borja", kind: "guest" as const, name: "borja", commanders: [{ id: "dup" }] },
        guest("carlos"),
        guest("laura"),
      ],
    };
    expect(() => initialMtgState(started(1000, clashing))).toThrow(PlayEventError);
  });
});

describe("commanderDamageBreakdown", () => {
  const setup = { ...makeSetup(), participants: [guestWithPartner("ana"), guest("borja"), guest("carlos"), guest("laura")] };
  const base = initialMtgState(started(1000, setup));

  it("desglosa por comandante, en orden de asiento, y solo los que han hecho daño", () => {
    let s = mtgReducer(base, ev<CommanderDamageEvent>("commander_damage", { source: "carlos-c1", target: "borja", delta: 7 }, 2000));
    s = mtgReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c2", target: "borja", delta: 21 }, 2100));

    const rows = commanderDamageBreakdown(s, "borja");
    // Ana va antes que Carlos (asiento 0 vs 2); ana-c1 y laura no aparecen: 0 daño.
    expect(rows.map((r) => r.commanderId)).toEqual(["ana-c2", "carlos-c1"]);
    expect(rows.map((r) => r.amount)).toEqual([21, 7]);
    expect(rows.map((r) => r.lethal)).toEqual([true, false]);
    expect(rows[0].sourceId).toBe("ana");
  });

  it("sin daño recibido, la lista va vacía", () => {
    expect(commanderDamageBreakdown(base, "borja")).toEqual([]);
  });
});
