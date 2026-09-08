import { describe, expect, it } from "vitest";
import { isEquipment, scaleLootEffect } from "./versions/r4.2/equipment";
import { createBattle, stepBattle, simulate } from "./versions/r4.2/engine";
import { simulate as simulateR4 } from "./versions/r4.1/engine";
import { RULESET, BROTE, CAPARAZON } from "./versions/r4.2/content";
import { RULESET as OLD_RULESET } from "./versions/r4.1/content";
import { isBattleSnapshot } from "./versions/r4.2/snapshot";
import { createUltiPuzzle } from "./versions/r4.2/ulti";
import { seedFromIndex } from "./versions/r4.2/prng";
import type { BattleInit, BattleInput, EquippedCopy, LootItemId } from "./versions/r4.2/types";

const copyId = "b8c124f8-23ea-4b4a-b9b1-582385d04d67";
const copy = (itemId: LootItemId, qualityBp = 10000): EquippedCopy => ({ copyId, itemId, qualityBp });
const snapshot = { name: "Bellota", petClass: "wizard" as const, stage: "adult" as const,
  attributes: { FUE: 1, CON: 1, INT: 1, SAB: 1, CAR: 1, DES: 1 }, tier: 1, hpMax: 1000, atk: 100,
  equipment: { weapon: null as EquippedCopy | null, amulet: null as EquippedCopy | null } };
const ctx = (weapon: EquippedCopy | null = null, amulet: EquippedCopy | null = null): BattleInit => ({ seed: seedFromIndex(1),
  snapshot: { ...snapshot, equipment: { weapon, amulet } }, ruleset: RULESET, enemies: [BROTE, CAPARAZON] });
const skill = (tick: number): BattleInput => ({ seq: 0, tick, action: "skill", payload: {} });

describe("r4.2 equipment authority and deterministic effects", () => {
  it("scales only valid quality with exact integer arithmetic", () => {
    expect(scaleLootEffect(10, 8000)).toBe(8);
    expect(scaleLootEffect(10, 12000)).toBe(12);
    expect(() => scaleLootEffect(10, 9999)).toThrow();
    expect(() => scaleLootEffect(Number.MAX_SAFE_INTEGER, 12000)).toThrow();
  });
  it("rejects missing equipment, forged quality, unknown fields and wrong slots", () => {
    const { equipment: _equipment, ...old } = snapshot;
    expect(isBattleSnapshot(old)).toBe(false);
    expect(isBattleSnapshot(snapshot)).toBe(true);
    expect(isEquipment({ weapon: copy("loan_pendant"), amulet: null })).toBe(false);
    expect(isEquipment({ weapon: { ...copy("sharp_bookmark"), extra: 1 }, amulet: null })).toBe(false);
    expect(isEquipment({ weapon: copy("sharp_bookmark", 9999), amulet: null })).toBe(false);
  });
  it.each([8000, 10000, 12000])("increases successful interruptions, not ordinary hits (%s)", q => {
    const c = ctx(copy("sharp_bookmark", q));
    const st = createBattle(c); st.tick = 1; st.enemy.phase = "windup"; st.enemy.phaseUntil = 20;
    const events = stepBattle(c, st, [skill(1)]);
    expect(events.find(e => e.type === "SKILL_USED")).toMatchObject({ damage: 400 + q / 100 });
    expect(events.find(e => e.type === "LOOT_EFFECT")).toMatchObject({ itemId: "sharp_bookmark", amount: q / 100 });
    const idle = createBattle(c); idle.tick = 1;
    expect(stepBattle(c, idle, [skill(1)]).some(e => e.type === "LOOT_EFFECT")).toBe(false);
  });
  it("shortens only a successfully interrupting skill cooldown", () => {
    const c = ctx(null, copy("loan_pendant", 12000)); const st = createBattle(c);
    st.tick = 1; st.enemy.phase = "windup"; st.enemy.phaseUntil = 20;
    stepBattle(c, st, [skill(1)]);
    expect(st.pet.skillReadyAt).toBe(49); // 1 + 60 - 12
    const idle = createBattle(c); idle.tick = 1; stepBattle(c, idle, [skill(1)]);
    expect(idle.pet.skillReadyAt).toBe(61);
  });
  it("extends actual vulnerability without creating it on Brote", () => {
    const c = ctx(copy("librarian_loupe", 12000)); c.enemies = [CAPARAZON];
    const st = createBattle(c); st.tick = 1; st.enemy.phase = "guard"; st.enemy.phaseUntil = 1;
    stepBattle(c, st, []); expect(st.enemy.phaseUntil).toBe(38); // 1 + 25 + 12
    c.enemies = [BROTE]; const b = createBattle(c); b.tick = 1; b.enemy.phase = "guard"; b.enemy.phaseUntil = 1;
    expect(stepBattle(c, b, []).some(e => e.type === "LOOT_EFFECT")).toBe(false);
    expect(b.enemy.phase).toBe("idle");
  });
  it.each(["power", "guard", "skip"] as const)("applies only the right ulti bonuses for %s", recipe => {
    const c = ctx(copy("heavy_ink_quill", 12000), copy("last_page_amulet", 12000));
    const st = createBattle(c); st.tick = 120; st.enemy.phaseUntil = 200;
    const order = recipe === "skip" ? "" : createUltiPuzzle(c.seed, 120).recipes.find(r => r.id === recipe)!.order.join("");
    const ev = stepBattle(c, st, [{ seq: 0, tick: 120, action: "ulti", payload: { order } }]);
    expect(ev.find(e => e.type === "ULTI_USED")).toMatchObject({ damage: recipe === "power" ? 720 : 400,
      shield: recipe === "guard" ? 260 : 60 });
    expect(ev.filter(e => e.type === "LOOT_EFFECT")).toHaveLength(recipe === "power" ? 2 : 1);
  });
  it("heals once at the next fight, caps at maximum and never revives", () => {
    const c = ctx(null, copy("streak_medallion", 12000)); const st = createBattle(c);
    expect(stepBattle(c, st, []).some(e => e.type === "LOOT_EFFECT")).toBe(false);
    st.tick = 1; st.pet.hp = 970; st.enemy.hp = 1; st.enemy.phaseUntil = 20;
    stepBattle(c, st, [skill(1)]);
    const start = stepBattle(c, st, []);
    expect(st.pet.hp).toBe(1000);
    expect(start.find(e => e.type === "LOOT_EFFECT")).toMatchObject({ effect: "heal", amount: 30 });
    expect(stepBattle(c, st, []).some(e => e.type === "LOOT_EFFECT")).toBe(false);
    const dead = createBattle(c); dead.tick = 1; dead.pet.hp = 1; dead.enemy.phase = "windup"; dead.enemy.phaseUntil = 1;
    const out = stepBattle(c, dead, []);
    expect(dead.result?.outcome).toBe("lose"); expect(out.some(e => e.type === "LOOT_EFFECT")).toBe(false);
  });
  it("empty equipment preserves r4.1 events and results across seeds", () => {
    const { equipment: _equipment, ...old } = snapshot;
    for (let i = 0; i < 50; i++) {
      const c = { ...ctx(), seed: seedFromIndex(i) };
      expect(simulate(c, [])).toEqual(simulateR4({ ...c, snapshot: old, ruleset: OLD_RULESET }, []));
    }
  });
});
