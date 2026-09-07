import { describe, expect, it } from "vitest";
import { enemyList, parseEnemyList, pickEnemies } from "./adventure";
import { BROTE, CAPARAZON, ENEMIES, RULESET } from "./content";
import { createBattle, simulate, stepBattle, viewOf } from "./engine";
import { POLICIES, runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import type { BattleInit, BattleInput, EnemyDef } from "./types";

const snapshot = snapshotForProfile("lectora_larga", "wizard");
const chain = (seed: string, enemies: EnemyDef[] = [BROTE, BROTE, BROTE], ruleset = RULESET): BattleInit => ({ seed, snapshot, enemies, ruleset });
const skill = (tick: number, seq: number): BattleInput => ({ seq, tick, action: "skill", payload: {} });
const ulti = (tick: number, seq: number): BattleInput => ({ seq, tick, action: "ulti", payload: { order: "" } });

describe("cadena r4.1 (spec R4a §3)", () => {
  it("un solo tramo se comporta como r3.1: ningún evento de tramo y fight 1", () => {
    const { events, result } = runPolicy(chain(seedFromIndex(1), [BROTE]), POLICIES.interrupt);
    expect(events.some((e) => e.type === "FIGHT_ENDED" || e.type === "FIGHT_STARTED")).toBe(false);
    expect(result.fight).toBe(1);
  });

  it("la vida se arrastra y habilidad, ulti y barrera se reinician en la frontera", () => {
    for (let i = 0; i < 100; i++) {
      const ctx = chain(seedFromIndex(i));
      const { inputs, events } = runPolicy(ctx, POLICIES.interrupt);
      const ended = events.find((e) => e.type === "FIGHT_ENDED");
      if (!ended || ended.type !== "FIGHT_ENDED") continue;
      expect(events.find((e) => e.type === "FIGHT_STARTED")).toMatchObject({ fight: 2, tick: ended.tick + 1, petHp: ended.petHp, enemyId: "brote" });
      const st = createBattle(ctx);
      while (st.tick <= ended.tick && !st.ended) stepBattle(ctx, st, inputs.filter((x) => x.tick === st.tick));
      const v = viewOf(st);
      expect(v).toMatchObject({ fight: 2, fights: 3, tick: ended.tick + 1, petHp: ended.petHp, shield: 0, ultiUsed: false, skillReadyAt: ended.tick + 1, ultiReadyAt: ended.tick + 1 + RULESET.ulti.readyAt });
      expect(v.enemyHp).toBe(v.enemyHpMax);
      return;
    }
    throw new Error("ningún seed en 100 supera el primer tramo con la política interrupt");
  });

  it("ganar el último tramo es victoria por KO en el tramo 3; el límite de un tramo en cadena es derrota", () => {
    const win = Array.from({ length: 200 }, (_, i) => runPolicy(chain(seedFromIndex(i)), POLICIES.interrupt).result).find((r) => r.outcome === "win");
    expect(win).toMatchObject({ reason: "ko", fight: 3 });
    const { result } = simulate(chain(seedFromIndex(0), [BROTE, BROTE], { ...RULESET, maxTicks: 10 }), []);
    expect(result).toMatchObject({ outcome: "lose", reason: "limit", fight: 1, ticks: 10 });
    expect(result.causes).toContain("time_limit");
  });

  it("los ticks son continuos: el log de una cadena larga lleva inputs más allá del tick 600 y se re-simula igual", () => {
    for (let i = 0; i < 200; i++) {
      const ctx = chain(seedFromIndex(i));
      const { inputs, result } = runPolicy(ctx, POLICIES.interrupt);
      if (!inputs.some((x) => x.tick > RULESET.maxTicks)) continue;
      const again = simulate(ctx, inputs);
      expect(again.result).toEqual(result);
      expect(inputs.at(-1)!.tick).toBeLessThanOrEqual(RULESET.adventure.chainLength * (RULESET.maxTicks + 1) - 1);
      return;
    }
    throw new Error("ninguna cadena en 200 seeds necesita inputs más allá del tick 600");
  });

  it("una ulti por tramo: dos en el mismo tramo lanzan; una por tramo tras su recarga vale", () => {
    const t1 = RULESET.ulti.readyAt;
    const renumber = (list: BattleInput[]): BattleInput[] => list.map((x, seq) => ({ ...x, seq }));
    for (let i = 0; i < 1000; i++) {
      const ctx = chain(seedFromIndex(i));
      const base = runPolicy(ctx, POLICIES.interrupt).inputs.filter((x) => x.tick < t1);
      // Primer tramo con una ulti en cuanto está lista; solo sirve si el combate sigue vivo después
      const probe = simulate(ctx, renumber([...base, ulti(t1, 0)]));
      if (probe.result.ticks <= t1 + 1) continue;
      expect(() => simulate(ctx, renumber([...base, ulti(t1, 0), ulti(t1 + 1, 0)]))).toThrow("INVALID_INPUTS");
      const second = probe.events.find((e) => e.type === "FIGHT_STARTED");
      if (!second || probe.result.ticks <= second.tick + RULESET.ulti.readyAt) continue;
      const both = simulate(ctx, renumber([...base, ulti(t1, 0), ulti(second.tick + RULESET.ulti.readyAt, 0)]));
      expect(both.events.filter((e) => e.type === "ULTI_USED")).toHaveLength(2);
      return;
    }
    throw new Error("ningún seed en 1000 llega al tramo 2 tras una ulti saltada en el tick 120");
  });

  it("pickEnemies es determinista y uniforme sobre el catálogo; parseEnemyList rechaza lo heredado", () => {
    expect(pickEnemies(seedFromIndex(3), 3, ENEMIES)).toEqual(pickEnemies(seedFromIndex(3), 3, ENEMIES));
    const ids = new Set(Array.from({ length: 200 }, (_, i) => enemyList(pickEnemies(seedFromIndex(i), 3, ENEMIES))).flatMap((s) => s.split(",")));
    expect([...ids].sort()).toEqual(["brote", "caparazon"]);
    expect(parseEnemyList("brote,caparazon", ENEMIES)).toEqual([BROTE, CAPARAZON]);
    expect(parseEnemyList("brote,__proto__", ENEMIES)).toBeNull();
    expect(() => createBattle(chain(seedFromIndex(0), [BROTE, BROTE, BROTE, BROTE]))).toThrow("BAD_CHAIN");
  });

  it("una acción desconocida que llegue al motor lanza (#1086)", () => {
    const ctx = chain(seedFromIndex(0), [BROTE]);
    const st = createBattle(ctx);
    expect(() => stepBattle(ctx, st, [{ seq: 0, tick: 0, action: "dance" as never, payload: {} }])).toThrow(/INVALID_INPUTS|UNKNOWN_ACTION/);
  });
});
