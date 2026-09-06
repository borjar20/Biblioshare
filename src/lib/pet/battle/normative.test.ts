import { describe, expect, it } from "vitest";
import normative from "./__fixtures__/normative.json";
import { canonicalJson } from "./versions/r2.2/canonical";
import { ENEMIES, RULESET, contentHash } from "./versions/r2.2/content";
import { battleDigest, digestMaterial, resimulate } from "./versions/r2.2/record";
import type { BattleEvent, BattleRecord } from "./versions/r2.2/types";

const record = normative.record as unknown as BattleRecord;
const events = normative.events as unknown as BattleEvent[];

describe("ejemplo normativo (spec R1 §12)", () => {
  it("es del contenido de hoy: si esto falla, regenerar con `pet:battle golden` y subir RULESET.version", async () => {
    expect(record.rulesetVersion).toBe(RULESET.version);
    expect(record.contentHash).toBe(await contentHash());
  });

  it("re-simular reproduce exactamente eventos, resultado y digest", async () => {
    const out = await resimulate(record, { ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(canonicalJson(out.events)).toBe(canonicalJson(events));
    expect(canonicalJson(out.result)).toBe(canonicalJson(record.result));
    expect(out.digest).toBe(normative.digest);
    expect(await battleDigest(record, events)).toBe(normative.digest);
  });

  it("los bytes del hash empiezan como dice la spec", () => {
    const material = digestMaterial(record, events);
    expect(material.slice(0, 240)).toBe(normative.canonicalHead);
    expect(material.length).toBe(normative.canonicalLength);
  });

  it("enseña las dos decisiones: interrumpe la primera carga y espera la primera guardia", () => {
    const kinds = events.filter((e) => e.type === "TELEGRAPH_STARTED").map((e) => (e.type === "TELEGRAPH_STARTED" ? e.kind : ""));
    expect(kinds.slice(0, 2)).toEqual(["charge", "guard"]);
    expect(events.find((e) => e.type === "SKILL_USED")).toMatchObject({ effect: "interrupt" });
    expect(events.some((e) => e.type === "SKILL_USED" && e.effect === "wasted")).toBe(false);
    expect(record.result).toMatchObject({ outcome: "win", causes: ["charges_interrupted"] });
  });
});
