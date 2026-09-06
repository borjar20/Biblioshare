import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { BROTE, ENEMIES, RULESET, contentHash } from "./content";
import { POLICIES, runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import { battleDigest, digestMaterial, resimulate, type ResimInput } from "./record";
import type { BattleRecord } from "./types";

const snapshot = snapshotForProfile("social", "bard");

async function makeRecord(i = 0, policy = POLICIES.interrupt) {
  const seed = seedFromIndex(i);
  const run = runPolicy({ seed, snapshot, enemy: BROTE, ruleset: RULESET }, policy);
  const record: BattleRecord = {
    rulesetVersion: RULESET.version,
    contentHash: await contentHash(),
    enemyId: BROTE.id,
    seed,
    snapshot,
    inputs: run.inputs,
    result: run.result,
  };
  return { record, events: run.events };
}
const content = async () => ({ ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() });

describe("digest", () => {
  it("es estable, hex de 64 y el material no contiene ningún digest", async () => {
    const { record, events } = await makeRecord();
    const d1 = await battleDigest(record, events);
    expect(d1).toBe(await battleDigest(record, events));
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(digestMaterial(record, events)).not.toContain("digest");
    expect(digestMaterial(record, events).startsWith('{"contentHash":"')).toBe(true);
  });

  it("cambia si cambia un input, el seed o el resultado", async () => {
    const { record, events } = await makeRecord();
    const base = await battleDigest(record, events);
    const inputs = record.inputs.map((x, i) => (i === 0 ? { ...x, tick: x.tick + 1 } : x));
    expect(await battleDigest({ ...record, inputs }, events)).not.toBe(base);
    expect(await battleDigest({ ...record, seed: seedFromIndex(9) }, events)).not.toBe(base);
    const result = { ...record.result, damageDealt: record.result.damageDealt + 1 };
    expect(await battleDigest({ ...record, result }, events)).not.toBe(base);
  });

  it("el material ignora claves ajenas al registro (id, status, digest)", async () => {
    const { record, events } = await makeRecord(6);
    // Lo que llega de la BD trae columnas que no firman nada: si entraran en el
    // material, el digest de la fila no coincidiría con el que calculó el motor.
    const conRuido = { ...record, id: "x", status: "resolved", digest: "0".repeat(64) } as BattleRecord;
    expect(digestMaterial(conRuido, events)).toBe(digestMaterial(record, events));
  });
});

describe("resimulate", () => {
  it("acepta un registro honesto y reproduce eventos y digest", async () => {
    const { record, events } = await makeRecord(1);
    const out = await resimulate(record, await content());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.events).toEqual(events);
      expect(out.digest).toBe(await battleDigest(record, events));
    }
  });

  it("sin result: produce el resultado y el digest coincide con el del registro completo", async () => {
    // Es la llamada del servidor en R2: la fila `open` todavía no tiene resultado.
    const { record, events } = await makeRecord(5);
    const open = Object.fromEntries(Object.entries(record).filter(([k]) => k !== "result")) as ResimInput;
    const out = await resimulate(open, await content());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(canonicalJson(out.result)).toBe(canonicalJson(record.result));
      expect(out.digest).toBe(await battleDigest(record, events));
    }
  });

  it("result null (fila abierta) cuenta como ausente", async () => {
    // Una fila `open` en pet_battles lleva result: null, que se pasa tal cual.
    // Debe tratarse como resultado ausente (producir el resultado), no rechazarse.
    const { record, events } = await makeRecord(7);
    const open = { ...record, result: null } as ResimInput;
    const out = await resimulate(open, await content());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(canonicalJson(out.result)).toBe(canonicalJson(record.result));
      expect(out.digest).toBe(await battleDigest(record, events));
    }
  });

  it("rechaza una victoria fabricada y un resultado retocado", async () => {
    const { record } = await makeRecord(2, POLICIES.never);
    const flipped = { ...record.result, outcome: record.result.outcome === "win" ? ("lose" as const) : ("win" as const) };
    expect(await resimulate({ ...record, result: flipped }, await content())).toEqual({ ok: false, code: "RESULT_MISMATCH" });
    const retouched = { ...record.result, damageDealt: record.result.damageDealt + 1 };
    expect(await resimulate({ ...record, result: retouched }, await content())).toEqual({ ok: false, code: "RESULT_MISMATCH" });
  });

  it("rechaza enemigo, versión, hash, seed e inputs inválidos con su código", async () => {
    const { record } = await makeRecord(3);
    const c = await content();
    expect(await resimulate({ ...record, enemyId: "dragon" }, c)).toEqual({ ok: false, code: "UNKNOWN_ENEMY" });
    expect(await resimulate({ ...record, enemyId: "__proto__" }, c)).toEqual({ ok: false, code: "UNKNOWN_ENEMY" });
    expect(await resimulate({ ...record, enemyId: "constructor" }, c)).toEqual({ ok: false, code: "UNKNOWN_ENEMY" });
    expect(await resimulate({ ...record, rulesetVersion: "r0" }, c)).toEqual({ ok: false, code: "RULESET_MISMATCH" });
    expect(await resimulate({ ...record, contentHash: "0".repeat(64) }, c)).toEqual({ ok: false, code: "CONTENT_MISMATCH" });
    expect(await resimulate({ ...record, seed: "0".repeat(32) }, c)).toEqual({ ok: false, code: "INVALID_SEED" });
    const badInputs = record.inputs.map((x) => ({ ...x, seq: x.seq + 1 }));
    expect(await resimulate({ ...record, inputs: badInputs }, c)).toEqual({ ok: false, code: "INVALID_INPUTS" });
  });

  it("rechaza un input posterior al final del combate", async () => {
    for (let i = 0; i < 10; i++) {
      const { record } = await makeRecord(i);
      if (record.result.reason !== "ko") continue;
      const inputs = [...record.inputs, { seq: record.inputs.length, tick: RULESET.maxTicks, action: "skill" as const, payload: {} }];
      expect(await resimulate({ ...record, inputs }, await content())).toEqual({ ok: false, code: "INPUTS_AFTER_END" });
      return;
    }
    throw new Error("ningún KO en 10 seeds con interrupt");
  });

  it("un resultado que no es canónico (número no entero) se rechaza como RESULT_MISMATCH, sin lanzar", async () => {
    const { record } = await makeRecord(4);
    const c = await content();
    const result = { ...record.result, damageDealt: 1.5 };
    expect(await resimulate({ ...record, result }, c)).toEqual({ ok: false, code: "RESULT_MISMATCH" });
  });
});
