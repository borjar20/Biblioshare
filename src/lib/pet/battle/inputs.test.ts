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

  it("copia un payload no vacío en un objeto nuevo", () => {
    const raw = [{ seq: 0, tick: 1, action: "skill", payload: { hp: 5, tag: "x" } }];
    const v = validateInputs(raw, RULESET);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.inputs[0].payload).toEqual({ hp: 5, tag: "x" });
      expect(v.inputs[0].payload).not.toBe(raw[0].payload);
    }
  });

  it.each([
    ["NOT_ARRAY", {}, undefined],
    ["TOO_MANY", ok(Array.from({ length: RULESET.maxInputs + 1 }, (_, i) => i)), undefined],
    ["BAD_SHAPE", [{ seq: 0, tick: 1, action: "skill" }], 0],
    ["BAD_SHAPE", [{ seq: 0, tick: 1, action: "skill", payload: {}, extra: 1 }], 0],
    ["BAD_SEQ", [{ seq: 1, tick: 1, action: "skill", payload: {} }], 0],
    ["BAD_TICK", [{ seq: 0, tick: -1, action: "skill", payload: {} }], 0],
    ["BAD_TICK", [{ seq: 0, tick: RULESET.maxTicks + 1, action: "skill", payload: {} }], 0],
    ["BAD_TICK", [{ seq: 0, tick: 1.5, action: "skill", payload: {} }], 0],
    ["TICK_ORDER", ok([10, 5]), 1],
    ["BAD_ACTION", [{ seq: 0, tick: 1, action: "ulti", payload: {} }], 0],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: { x: 1.5 } }], 0],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: null }], 0],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: [1] }], 0],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: JSON.parse("{\"__proto__\": \"x\"}") }], 0],
  ])("rechaza %s", (code, raw, expectedIndex) => {
    const v = validateInputs(raw, RULESET);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe(code);
      if (expectedIndex !== undefined) expect(v.index).toBe(expectedIndex);
    }
  });
});
