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

  it("rechaza un payload no vacío", () => {
    const raw = [{ seq: 0, tick: 1, action: "skill", payload: { hp: 5, tag: "x" } }];
    const v = validateInputs(raw, RULESET);
    expect(v).toEqual({ ok: false, code: "NONEMPTY_PAYLOAD", index: 0 });
  });

  it.each([new Date(0), Object.create({ inherited: 1 }), { [Symbol("hidden")]: 1 }])("rejects non-plain or hidden payload data: %#", (payload) => {
    expect(validateInputs([{ seq: 0, tick: 0, action: "skill", payload }], RULESET))
      .toEqual({ ok: false, code: "BAD_PAYLOAD", index: 0 });
  });

  it("rechaza la reproducción de un payload con 300 campos de 5000 caracteres", () => {
    const payload = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`field${i}`, "x".repeat(5000)]));
    const raw = [{ ...ok([0])[0], payload }];
    expect(validateInputs(raw, RULESET)).toEqual({ ok: false, code: "NONEMPTY_PAYLOAD", index: 0 });
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
    ["BAD_ACTION", [{ seq: 0, tick: 1, action: "unknown", payload: {} }], 0],
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

describe("validateInputs con tramos (r4.1)", () => {
  const skillAt = (tick: number, seq: number) => ({ seq, tick, action: "skill", payload: {} });
  const ultiAt = (tick: number, seq: number) => ({ seq, tick, action: "ulti", payload: { order: "" } });
  it("acepta ticks hasta la cota global y rechaza el siguiente", () => {
    const last = 3 * (RULESET.maxTicks + 1) - 1;
    expect(validateInputs([skillAt(last, 0)], RULESET, 3).ok).toBe(true);
    expect(validateInputs([skillAt(last + 1, 0)], RULESET, 3)).toMatchObject({ ok: false, code: "BAD_TICK" });
    expect(validateInputs([skillAt(RULESET.maxTicks + 1, 0)], RULESET, 1)).toMatchObject({ ok: false, code: "BAD_TICK" });
  });
  it("presupuesto de inputs por tramo × tramos", () => {
    const many = Array.from({ length: RULESET.maxInputs * 3 }, (_, i) => skillAt(i, i));
    expect(validateInputs(many, RULESET, 3).ok).toBe(true);
    expect(validateInputs([...many, skillAt(many.length, many.length)], RULESET, 3)).toMatchObject({ ok: false, code: "TOO_MANY" });
  });
  it("una segunda ulti no se rechaza aquí en cadena (la juzga el motor), pero sí en un solo tramo", () => {
    const two = [ultiAt(RULESET.ulti.readyAt, 0), ultiAt(RULESET.ulti.readyAt + 700, 1)];
    expect(validateInputs(two, RULESET, 3).ok).toBe(true);
    expect(validateInputs(two, RULESET, 1)).toMatchObject({ ok: false, code: "BAD_TICK" });
    expect(validateInputs([ultiAt(RULESET.ulti.readyAt, 0), ultiAt(RULESET.ulti.readyAt + 1, 1)], RULESET, 1)).toMatchObject({ ok: false, code: "ULTI_ALREADY_USED" });
    expect(validateInputs([ultiAt(RULESET.ulti.readyAt - 1, 0)], RULESET, 3)).toMatchObject({ ok: false, code: "ULTI_NOT_READY" });
  });
  it("tramos fuera de rango", () => {
    expect(validateInputs([], RULESET, 0)).toMatchObject({ ok: false, code: "BAD_CHAIN" });
    expect(validateInputs([], RULESET, RULESET.adventure.chainLength + 1)).toMatchObject({ ok: false, code: "BAD_CHAIN" });
    expect(validateInputs([], RULESET, 1.5)).toMatchObject({ ok: false, code: "BAD_CHAIN" });
  });
});
