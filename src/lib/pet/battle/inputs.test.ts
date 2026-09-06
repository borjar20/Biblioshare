import { describe, expect, it } from "vitest";
import { RULESET } from "./content";
import { validateInputs } from "./inputs";

const ok = (ticks: number[]) => ticks.map((tick, seq) => ({ seq, tick, action: "skill", payload: {} }));

describe("validateInputs", () => {
  it("acepta un log bien formado y devuelve copias tipadas", () => {
    const raw = ok([3, 3, 120]);
    const v = validateInputs(raw, RULESET);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.inputs).toEqual(raw);
      expect(v.inputs[0]).not.toBe(raw[0]);
    }
  });

  it("vacío es válido", () => {
    expect(validateInputs([], RULESET).ok).toBe(true);
  });

  it.each([
    ["NOT_ARRAY", {}],
    ["TOO_MANY", ok(Array.from({ length: RULESET.maxInputs + 1 }, (_, i) => i))],
    ["BAD_SHAPE", [{ seq: 0, tick: 1, action: "skill" }]],
    ["BAD_SHAPE", [{ seq: 0, tick: 1, action: "skill", payload: {}, extra: 1 }]],
    ["BAD_SEQ", [{ seq: 1, tick: 1, action: "skill", payload: {} }]],
    ["BAD_TICK", [{ seq: 0, tick: -1, action: "skill", payload: {} }]],
    ["BAD_TICK", [{ seq: 0, tick: RULESET.maxTicks + 1, action: "skill", payload: {} }]],
    ["BAD_TICK", [{ seq: 0, tick: 1.5, action: "skill", payload: {} }]],
    ["TICK_ORDER", ok([10, 5])],
    ["BAD_ACTION", [{ seq: 0, tick: 1, action: "ulti", payload: {} }]],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: { x: 1.5 } }]],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: null }]],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: [1] }]],
  ])("rechaza %s", (code, raw) => {
    const v = validateInputs(raw, RULESET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe(code);
  });
});
