import { describe, expect, it } from "vitest";
import { BROTE, RULESET } from "./content";
import { simulate } from "./engine";
import { enemyStats } from "./power";
import { runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import type { BattleInit, BattleInput, EnemyDef, Ruleset } from "./types";

// #1087: las cuatro ramas del orden del tick (C5) que engine.test.ts no fijaba.
const snapshot = snapshotForProfile("lectora_larga", "wizard");
const skill = (tick: number, seq = 0): BattleInput => ({ seq, tick, action: "skill", payload: {} });
// La forma de BattleInit cambia en r4.1 (enemies[]); este helper es el único sitio que lo sabe.
const init = (seed: string, enemy: EnemyDef = BROTE, ruleset: Ruleset = RULESET): BattleInit => ({ seed, snapshot, enemy, ruleset });

function firstGuardTick(ctx: BattleInit): number {
  const ev = simulate(ctx, []).events.find((e) => e.type === "TELEGRAPH_STARTED" && e.kind === "guard");
  if (!ev) throw new Error("sin guardia en este seed");
  return ev.tick;
}

describe("orden del tick (#1087)", () => {
  it("1. KO por castigo a mitad del bucle de inputs: acaba ahí, sin básica posterior, causa skill_wasted_on_guard", () => {
    // Enemigo local: siempre guardia y castigo del 100 % de la vida → un solo golpe en guardia mata.
    const lethal: EnemyDef = { ...BROTE, id: "brote", chargeBp: 0, punishPct: 100 };
    const ctx = init(seedFromIndex(0), lethal);
    const t = firstGuardTick(ctx) + 1;
    const { events, result } = simulate(ctx, [skill(t)]);
    const ended = events.find((e) => e.type === "BATTLE_ENDED");
    expect(ended).toMatchObject({ tick: t, outcome: "lose", reason: "ko" });
    expect(events.filter((e) => e.tick === t).map((e) => e.type)).not.toContain("PET_BASIC");
    expect(result.causes).toContain("skill_wasted_on_guard");
    expect(result.ticks).toBe(t);
  });

  it("2. maxTicks igual al tick de un KO: gana el KO, no el límite", () => {
    const seed = Array.from({ length: 50 }, (_, i) => seedFromIndex(i)).find((s) => simulate(init(s), []).result.reason === "ko");
    expect(seed).toBeDefined();
    const K = simulate(init(seed!), []).result.ticks;
    const { result } = simulate(init(seed!, BROTE, { ...RULESET, maxTicks: K }), []);
    expect(result).toMatchObject({ reason: "ko", ticks: K });
  });

  it("3. aturdimiento que expira en el tick del input: el input ve reposo y pega como hit", () => {
    // Cooldown corto para poder pulsar dos veces dentro del aturdimiento; seed cuya primera carga se interrumpe.
    const ruleset: Ruleset = { ...RULESET, pet: { ...RULESET.pet, skillCooldown: 5 } };
    for (let i = 0; i < 100; i++) {
      const ctx = init(seedFromIndex(i), BROTE, ruleset);
      const windup = simulate(ctx, []).events.find((e) => e.type === "TELEGRAPH_STARTED" && e.kind === "charge");
      if (!windup) continue;
      const t = windup.tick + 1;
      const until = t + BROTE.staggerTicks;
      const probe = simulate(ctx, [skill(t)]);
      if (probe.result.ticks < until) continue; // el combate no llega al fin del aturdimiento
      const { events } = simulate(ctx, [skill(t), skill(until, 1)]);
      const atUntil = events.filter((e) => e.tick === until).map((e) => e.type);
      expect(atUntil.indexOf("STATUS_EXPIRED")).toBeLessThan(atUntil.indexOf("SKILL_USED"));
      expect(events.find((e) => e.tick === until && e.type === "SKILL_USED")).toMatchObject({ effect: "hit" });
      return;
    }
    throw new Error("ningún seed en 100 sirve para el caso");
  });

  it("4. causesFor se queda con dos: las de daño por orden y time_limit se cae", () => {
    const es = enemyStats(BROTE, snapshot);
    const guardOnly = (v: { tick: number; skillReadyAt: number; enemyPhase: string }) => v.tick >= v.skillReadyAt && v.enemyPhase === "guard";
    // maxTicks: 250 casi siempre KO antes del límite (una carga aterrizada cuesta el 40 % de
    // la vida máxima y una habilidad desperdiciada el 25 %). Se barren varios maxTicks más
    // cortos junto con el seed para que el límite llegue antes de que la mascota muera.
    const maxTicksCandidates = [110, 130, 150, 170, 190, 210, 230, 250];
    for (let i = 0; i < 1000; i++) {
      for (const maxTicks of maxTicksCandidates) {
        const ctx = init(seedFromIndex(i), BROTE, { ...RULESET, maxTicks });
        const { events, result } = runPolicy(ctx, guardOnly);
        const landed = events.filter((e) => e.type === "TELEGRAPH_RESOLVED" && e.kind === "charge" && e.damage > 0).length;
        const wasted = events.filter((e) => e.type === "SKILL_USED" && e.effect === "wasted").length;
        if (result.reason !== "limit" || result.outcome !== "lose" || landed === 0 || wasted === 0) continue;
        const expected = [["charges_landed", landed * es.charge], ["skill_wasted_on_guard", wasted * es.punish]]
          .sort((a, b) => (b[1] as number) - (a[1] as number)).map(([c]) => c);
        expect(result.causes).toEqual(expected);
        expect(result.causes).not.toContain("time_limit");
        return;
      }
    }
    throw new Error("ningún seed en 1000 x maxTicks pierde por límite con carga aterrizada y habilidad desperdiciada");
  });
});
