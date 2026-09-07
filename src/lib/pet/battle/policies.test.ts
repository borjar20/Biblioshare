import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { BROTE, RULESET } from "./content";
import { simulate } from "./engine";
import { POLICIES, POLICY_IDS, runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";

const snapshot = snapshotForProfile("cinefila", "cleric");
const ctx = (i: number) => ({ seed: seedFromIndex(i), snapshot, enemies: [BROTE], ruleset: RULESET });

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
});
