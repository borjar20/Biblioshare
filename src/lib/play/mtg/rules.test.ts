import { describe, expect, it } from "vitest";
import { mtgReducer, initialMtgState } from "./reducer";
import { lossConditions, nextAliveSeat } from "./rules";
import { ev, started } from "./test-fixtures";
import type {
  CommanderDamageEvent,
  LifeChangedEvent,
  PlayerEliminatedEvent,
  PoisonChangedEvent,
  TurnPassedEvent,
} from "./events";

describe("nextAliveSeat", () => {
  const base = initialMtgState(started(1000)); // ana, borja, carlos, laura

  it("el siguiente asiento cuando están todos vivos", () => {
    expect(nextAliveSeat(base)).toBe(1);
    expect(nextAliveSeat({ ...base, activeSeat: 3 })).toBe(0);
  });

  it("salta a los eliminados", () => {
    const s = mtgReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "borja" }, 2000));
    expect(nextAliveSeat(s)).toBe(2);
  });

  it("dice EXACTAMENTE a quién pondrá activo el reducer", () => {
    // Es la razón de que exista: la consola nombra a quien le toca, y si esta regla
    // y la del reducer se separan, la UI miente sobre lo que va a pasar al pulsar.
    let s = mtgReducer(base, ev<PlayerEliminatedEvent>("player_eliminated", { target: "borja" }, 2000));
    s = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "carlos" }, 2100));
    const esperado = nextAliveSeat(s);
    const despues = mtgReducer(s, ev<TurnPassedEvent>("turn_passed", {}, 2200));
    expect(despues.activeSeat).toBe(esperado);
  });

  it("con nadie más vivo devuelve el asiento activo, no da vueltas", () => {
    let s = base;
    for (const target of ["borja", "carlos", "laura"]) {
      s = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target }, 2000));
    }
    expect(nextAliveSeat(s)).toBe(0);
  });
});

describe("lossConditions", () => {
  const base = initialMtgState(started(1000));

  it("umbrales exactos: 0 vidas, 10 veneno, 21 de comandante — y un punto antes, nada", () => {
    let s = mtgReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -39 }, 2000));
    expect(lossConditions(s, "ana")).toEqual([]); // 1 vida
    s = mtgReducer(s, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -1 }, 2100));
    expect(lossConditions(s, "ana")).toEqual(["life"]); // 0 vidas

    let p = mtgReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "borja", delta: 9 }, 2000));
    expect(lossConditions(p, "borja")).toEqual([]);
    p = mtgReducer(p, ev<PoisonChangedEvent>("poison_changed", { target: "borja", delta: 1 }, 2100));
    expect(lossConditions(p, "borja")).toEqual(["poison"]);

    let c = mtgReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "carlos", delta: 20 }, 2000),
    );
    expect(lossConditions(c, "carlos")).toEqual([]); // 20 de ana y 20 vidas
    c = mtgReducer(c, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "carlos", delta: 1 }, 2100));
    expect(lossConditions(c, "carlos")).toEqual(["commander_damage"]); // 21 del MISMO comandante, 19 vidas
  });

  it("es por comandante individual: 15+15 de dos atacantes distintos no dispara la condición", () => {
    let s = mtgReducer(
      base,
      ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "laura", delta: 15 }, 2000),
    );
    s = mtgReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "borja-c1", target: "laura", delta: 15 }, 2100));
    // 40 − 30 = 10 vidas y ningún comandante llega a 21: ninguna condición.
    expect(lossConditions(s, "laura")).toEqual([]);
  });

  it("un jugador ya eliminado no señaliza nada", () => {
    let s = mtgReducer(base, ev<LifeChangedEvent>("life_changed", { target: "ana", delta: -40 }, 2000));
    s = mtgReducer(s, ev<PlayerEliminatedEvent>("player_eliminated", { target: "ana", reason: "life" }, 2100));
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
    let s = mtgReducer(base, ev<PoisonChangedEvent>("poison_changed", { target: "carlos", delta: 10 }, 2000));
    s = mtgReducer(s, ev<CommanderDamageEvent>("commander_damage", { source: "ana-c1", target: "carlos", delta: 21 }, 2100));
    s = mtgReducer(s, ev<LifeChangedEvent>("life_changed", { target: "carlos", delta: -20 }, 2200));
    expect(lossConditions(s, "carlos")).toEqual(["life", "poison", "commander_damage"]);
  });
});
