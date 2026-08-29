import { describe, expect, it } from "vitest";
import { commanderReducer, initialCommanderState } from "./reducer";
import { lossConditions } from "./rules";
import { ev, started } from "./test-fixtures";
import type { CommanderDamageEvent, LifeChangedEvent, PlayerEliminatedEvent, PoisonChangedEvent } from "./events";

describe("lossConditions", () => {
  const base = initialCommanderState(started(1000));

  it("umbrales exactos: 0 vidas, 10 veneno, 21 de comandante — y un punto antes, nada", () => {
    let s = commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -39 }, 2000));
    expect(lossConditions(s, "ana")).toEqual([]); // 1 vida
    s = commanderReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -1 }, 2100));
    expect(lossConditions(s, "ana")).toEqual(["life"]); // 0 vidas

    let p = commanderReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "borja", delta: 9 }, 2000));
    expect(lossConditions(p, "borja")).toEqual([]);
    p = commanderReducer(p, ev<PoisonChangedEvent>("poison_changed", { target: "borja", delta: 1 }, 2100));
    expect(lossConditions(p, "borja")).toEqual(["poison"]);

    let c = commanderReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "ana", target: "carlos", delta: 20 }, 2000),
    );
    expect(lossConditions(c, "carlos")).toEqual([]); // 20 de ana y 20 vidas
    c = commanderReducer(c, ev<CommanderDamageEvent>("commander_damage", { source: "ana", target: "carlos", delta: 1 }, 2100));
    expect(lossConditions(c, "carlos")).toEqual(["commander_damage"]); // 21 del MISMO comandante, 19 vidas
  });

  it("es por comandante individual: 15+15 de dos atacantes distintos no dispara la condición", () => {
    let s = commanderReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "ana", target: "laura", delta: 15 }, 2000),
    );
    s = commanderReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "borja", target: "laura", delta: 15 }, 2100));
    // 40 − 30 = 10 vidas y ningún comandante llega a 21: ninguna condición.
    expect(lossConditions(s, "laura")).toEqual([]);
  });

  it("un jugador ya eliminado no señaliza nada", () => {
    let s = commanderReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -40 }, 2000));
    s = commanderReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana", reason: "life" }, 2100));
    expect(lossConditions(s, "ana")).toEqual([]);
  });

  it("un id desconocido (no participante) retorna vacío", () => {
    expect(lossConditions(base, "unknown-id-not-in-state")).toEqual([]);
  });

  it("las tres condiciones pueden ocurrir a la vez y se reportan en orden: vida, veneno, daño de comandante", () => {
    // Derivación del estado:
    // - Partimos con vida=40, veneno=0, daño_comandante={}
    // - Aplicamos veneno +10 → vida=40, veneno=10
    // - Aplicamos daño de comandante +21 de "ana" → vida=19, veneno=10, daño["ana"]=21
    // - Aplicamos daño de vida -20 → vida=-1, veneno=10, daño["ana"]=21
    // Esperado: ["life", "poison", "commander_damage"]
    let s = commanderReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "carlos", delta: 10 }, 2000));
    s = commanderReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "ana", target: "carlos", delta: 21 }, 2100));
    s = commanderReducer(s, ev<LifeChangedEvent>("life_changed", { target: "carlos", delta: -20 }, 2200));
    expect(lossConditions(s, "carlos")).toEqual(["life", "poison", "commander_damage"]);
  });
});
