import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { BROTE, RULESET } from "./content";
import { createBattle, simulate, stepBattle, viewOf } from "./engine";
import { enemyStats } from "./power";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import type { BattleEvent, BattleInit, BattleInput, TelegraphKind } from "./types";

const snapshot = snapshotForProfile("lectora_larga", "wizard");
const es = enemyStats(BROTE, snapshot);
const init = (seed: string, ruleset = RULESET): BattleInit => ({ seed, snapshot, enemy: BROTE, ruleset });
const skill = (tick: number, seq = 0): BattleInput => ({ seq, tick, action: "skill", payload: {} });

function firstTelegraph(seed: string) {
  const ev = simulate(init(seed), []).events.find((e) => e.type === "TELEGRAPH_STARTED");
  if (!ev || ev.type !== "TELEGRAPH_STARTED") throw new Error("sin anuncio");
  return ev;
}
function seedWhoseFirstTelegraphIs(kind: TelegraphKind): string {
  for (let i = 0; i < 1000; i++) if (firstTelegraph(seedFromIndex(i)).kind === kind) return seedFromIndex(i);
  throw new Error("no hay seed");
}
/** Vida de la mascota según el último evento anterior a `index` que la lleve. */
function petHpBefore(events: BattleEvent[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    const e = events[i];
    if ("petHp" in e) return e.petHp;
  }
  return snapshot.hpMax;
}

describe("arranque y básica", () => {
  it("BATTLE_STARTED con vidas completas; primera básica en el tick 15 por atk", () => {
    const { events } = simulate(init(seedFromIndex(0)), []);
    expect(events[0]).toEqual({ seq: 0, tick: 0, type: "BATTLE_STARTED", petHp: snapshot.hpMax, enemyHp: es.hpMax });
    const basic = events.find((e) => e.type === "PET_BASIC");
    expect(basic).toMatchObject({ tick: 15, damage: snapshot.atk, guarded: false });
  });
});

describe("determinismo e invariantes", () => {
  it("mismos inputs → mismos eventos y resultado (50 seeds)", () => {
    for (let i = 0; i < 50; i++) {
      const a = simulate(init(seedFromIndex(i)), [skill(5), skill(100, 1)]);
      const b = simulate(init(seedFromIndex(i)), [skill(5), skill(100, 1)]);
      expect(canonicalJson(a)).toBe(canonicalJson(b));
    }
  });

  it("seq contiguos, ticks no decrecientes, vida nunca negativa, termina con BATTLE_ENDED", () => {
    // Inputs solo en ticks anteriores a cualquier KO posible. Hasta el tick 36 la mascota
    // (230 PV) no puede haber perdido: como mucho una carga (92) y una básica (9), y el
    // input del tick 5 cae siempre en el reposo inicial (idleMin = 20), así que no hay castigo.
    for (let i = 0; i < 50; i++) {
      const { events, result } = simulate(init(seedFromIndex(i)), i % 2 ? [skill(5), skill(36, 1)] : []);
      events.forEach((e, idx) => {
        expect(e.seq).toBe(idx);
        if (idx > 0) expect(e.tick).toBeGreaterThanOrEqual(events[idx - 1].tick);
        if ("petHp" in e) expect(e.petHp).toBeGreaterThanOrEqual(0);
        if ("enemyHp" in e) expect(e.enemyHp).toBeGreaterThanOrEqual(0);
      });
      const last = events[events.length - 1];
      expect(last.type).toBe("BATTLE_ENDED");
      expect(last.tick).toBe(result.ticks);
      expect(result.ticks).toBeLessThanOrEqual(RULESET.maxTicks);
    }
  });
});

describe("la habilidad y los dos anuncios", () => {
  it("durante la carga interrumpe: 4×atk, aturde 20 ticks y la carga no aterriza", () => {
    const seed = seedWhoseFirstTelegraphIs("charge");
    const t = firstTelegraph(seed);
    const { events } = simulate(init(seed), [skill(t.tick + 1)]);
    const used = events.findIndex((e) => e.type === "SKILL_USED");
    expect(events[used]).toMatchObject({ tick: t.tick + 1, effect: "interrupt", damage: snapshot.atk * RULESET.pet.skillInterruptMul });
    expect(events[used + 1]).toMatchObject({ type: "STATUS_APPLIED", status: "stagger", until: t.tick + 1 + BROTE.staggerTicks });
    const expired = events.find((e) => e.type === "STATUS_EXPIRED");
    expect(expired).toMatchObject({ tick: t.tick + 1 + BROTE.staggerTicks });
    const landed = events.find((e) => e.type === "TELEGRAPH_RESOLVED" && e.kind === "charge" && e.tick < t.tick + 1 + BROTE.staggerTicks);
    expect(landed).toBeUndefined();
  });

  it("en resolvesAt llega tarde: la carga aterriza (40 %) y la habilidad pega en reposo", () => {
    const seed = seedWhoseFirstTelegraphIs("charge");
    const t = firstTelegraph(seed);
    const { events } = simulate(init(seed), [skill(t.resolvesAt)]);
    const resolved = events.findIndex((e) => e.type === "TELEGRAPH_RESOLVED");
    expect(events[resolved]).toMatchObject({ tick: t.resolvesAt, kind: "charge", damage: es.charge });
    expect(events[resolved].type === "TELEGRAPH_RESOLVED" && events[resolved].petHp).toBe(petHpBefore(events, resolved) - es.charge);
    const used = events.find((e) => e.type === "SKILL_USED");
    expect(used).toMatchObject({ tick: t.resolvesAt, effect: "hit", damage: snapshot.atk * RULESET.pet.skillIdleMul });
    expect(used!.seq).toBeGreaterThan(events[resolved].seq);
  });

  it("durante la guardia: habilidad desperdiciada con castigo, básicas a un cuarto", () => {
    const seed = seedWhoseFirstTelegraphIs("guard");
    const t = firstTelegraph(seed);
    const { events } = simulate(init(seed), [skill(t.tick + 1)]);
    const used = events.findIndex((e) => e.type === "SKILL_USED");
    expect(events[used]).toMatchObject({ tick: t.tick + 1, effect: "wasted", damage: 0 });
    const ev = events[used];
    expect(ev.type === "SKILL_USED" && ev.petHp).toBe(petHpBefore(events, used) - es.punish);
    const guarded = events.find((e) => e.type === "PET_BASIC" && e.guarded);
    expect(guarded).toMatchObject({ damage: Math.max(1, Math.floor(snapshot.atk / RULESET.pet.guardBasicDiv)) });
    expect(guarded!.tick).toBeGreaterThanOrEqual(t.tick);
    expect(guarded!.tick).toBeLessThan(t.resolvesAt);
  });

  it("cooldown: dos inputs en el mismo tick → el segundo se ignora; listo justo en readyAt", () => {
    const cd = RULESET.pet.skillCooldown;
    const { events } = simulate(init(seedFromIndex(3)), [skill(5, 0), skill(5, 1), skill(5 + cd - 1, 2), skill(5 + cd, 3)]);
    const skills = events.filter((e) => e.type === "SKILL_USED" || e.type === "SKILL_IGNORED");
    expect(skills.map((e) => [e.tick, e.type])).toEqual([
      [5, "SKILL_USED"],
      [5, "SKILL_IGNORED"],
      [5 + cd - 1, "SKILL_IGNORED"],
      [5 + cd, "SKILL_USED"],
    ]);
  });
});

describe("fin", () => {
  it("límite: con maxTicks 10 nadie ha pegado → draw; con 16 la mascota ya pegó → win", () => {
    expect(simulate(init(seedFromIndex(0), { ...RULESET, maxTicks: 10 }), []).result).toMatchObject({ outcome: "draw", reason: "limit", ticks: 10 });
    expect(simulate(init(seedFromIndex(0), { ...RULESET, maxTicks: 16 }), []).result).toMatchObject({ outcome: "win", reason: "limit", ticks: 16 });
  });

  it("sin pulsar, algún seed pierde por KO y su primera causa es skill_unused", () => {
    for (let i = 0; i < 20; i++) {
      const { result } = simulate(init(seedFromIndex(i)), []);
      if (result.outcome === "lose") {
        expect(result.reason).toBe("ko");
        expect(result.causes[0]).toBe("skill_unused");
        return;
      }
    }
    throw new Error("ninguna derrota en 20 seeds sin pulsar: revisar C6");
  });

  it("un input posterior al final invalida el log", () => {
    // Un seed cuyo combate sin inputs acaba por KO antes del límite.
    const seed = Array.from({ length: 50 }, (_, i) => seedFromIndex(i)).find(
      (s) => simulate(init(s), []).result.reason === "ko",
    );
    expect(seed).toBeDefined();
    expect(() => simulate(init(seed!), [skill(RULESET.maxTicks)])).toThrow("INPUTS_AFTER_END");
  });

  it("stepBattle lanza INPUT_TICK si un input no es del tick actual", () => {
    // Agrupar los inputs por tick es cosa de quien llama (simulate): un input de
    // otro tick es un bug del llamante, no una entrada hostil del cliente.
    const ctx = init(seedFromIndex(0));
    const st = createBattle(ctx);
    expect(() => stepBattle(ctx, st, [skill(7)])).toThrow("INPUT_TICK");
  });

  it("stepBattle sobre un combate terminado lanza; viewOf expone fase y cooldown", () => {
    const ctx = init(seedFromIndex(0));
    const st = createBattle(ctx);
    expect(viewOf(st)).toMatchObject({ tick: 0, enemyPhase: "idle", skillReadyAt: 0, ended: false });
    while (!st.ended) stepBattle(ctx, st, []);
    expect(() => stepBattle(ctx, st, [])).toThrow("BATTLE_ENDED");
    expect(viewOf(st).ended).toBe(true);
  });
});
