import { describe, expect, it } from "vitest";
import { pickEnemies } from "./adventure";
import { canonicalJson } from "./canonical";
import { BROTE, ENEMIES, RULESET } from "./content";
import { simulate } from "./engine";
import { POLICIES, POLICY_IDS, runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";

const snapshot = snapshotForProfile("cinefila", "cleric");
const ctx = (i: number) => ({ seed: seedFromIndex(i), snapshot, enemies: [BROTE], ruleset: RULESET });
const LEGACY_POLICY_IDS = POLICY_IDS.filter((id) => id !== "interrupt_ulti");

describe("runPolicy", () => {
  it("never no genera inputs y coincide con simulate([])", () => {
    const run = runPolicy(ctx(1), POLICIES.never);
    expect(run.inputs).toEqual([]);
    expect(canonicalJson(run.events)).toBe(canonicalJson(simulate(ctx(1), []).events));
  });

  it("lo que graba una política se re-simula igual: el log ES el estado", () => {
    for (const id of POLICY_IDS) {
      for (let i = 0; i < 20; i++) {
        const run = runPolicy(ctx(i), POLICIES[id]);
        const again = simulate(ctx(i), run.inputs);
        expect(canonicalJson(again)).toBe(canonicalJson({ events: run.events, result: run.result }));
      }
    }
  });

  it("interrupt solo pulsa durante la carga; si gana, la causa es charges_interrupted", () => {
    // El primer seed cuyo combate trae alguna carga (con 8 anuncios sin carga sería 1 entre 256).
    const run = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => runPolicy(ctx(i), POLICIES.interrupt)).find((r) => r.events.some((e) => e.type === "SKILL_USED"))!;
    const used = run.events.filter((e) => e.type === "SKILL_USED");
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((e) => e.type === "SKILL_USED" && e.effect === "interrupt")).toBe(true);
    if (run.result.outcome === "win") expect(run.result.causes).toEqual(["charges_interrupted"]);
  });

  it("spam pulsa en cuanto puede: empieza en el tick 0, nunca SKILL_IGNORED, cabe en maxInputs", () => {
    const run = runPolicy(ctx(4), POLICIES.spam);
    expect(run.inputs[0]).toMatchObject({ seq: 0, tick: 0 });
    expect(run.events.some((e) => e.type === "SKILL_IGNORED")).toBe(false);
    expect(run.inputs.length).toBeLessThanOrEqual(RULESET.maxInputs);
  });

  it("las tres políticas heredadas solo generan inputs de skill", () => {
    for (const id of LEGACY_POLICY_IDS) {
      for (let i = 0; i < 10; i++) {
        const run = runPolicy(ctx(i), POLICIES[id]);
        expect(run.inputs.every((input) => input.action === "skill")).toBe(true);
      }
    }
  });

  it("interrupt_ulti lanza la ulti Potencia en cuanto está lista, una vez por tramo alcanzado, y su log re-simula igual", () => {
    // Cadena de 3 tramos: buscamos un seed que alcance al menos el tramo 2 para
    // comprobar que la ulti se relanza al reiniciarse por tramo (spec R4a §3).
    const chainCtx = (i: number) => {
      const seed = seedFromIndex(i);
      return { seed, snapshot, enemies: pickEnemies(seed, 3, ENEMIES), ruleset: RULESET };
    };
    const run = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((i) => ({ i, run: runPolicy(chainCtx(i), POLICIES.interrupt_ulti) }))
      .find(({ run }) => run.result.fight >= 2)!;
    const { i, run: r } = run;
    const ultiEvents = r.events.filter((e) => e.type === "ULTI_USED");
    const fightsReached = r.result.fight;
    expect(ultiEvents.length).toBe(fightsReached);
    for (const e of ultiEvents) {
      expect(e.type).toBe("ULTI_USED");
      if (e.type === "ULTI_USED") {
        expect(e.recipe).toBe("power");
        expect(e.matches).toBe(4);
      }
    }
    const again = simulate(chainCtx(i), r.inputs);
    expect(canonicalJson(again)).toBe(canonicalJson({ events: r.events, result: r.result }));
  });
});
