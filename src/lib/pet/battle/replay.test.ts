import { describe, expect, it, vi } from "vitest";
import normative from "./versions/r2.2/normative.json";
import { BATTLE_RELEASES, replayBattle } from "./replay";
import { resimulate, type ResimInput } from "./record";
import { RULESET, ENEMIES } from "./content";
import { canonicalJson } from "./canonical";
import { sha256Hex } from "./hash";
import type { BattleRecord } from "./types";

const record = normative.record as BattleRecord;

describe("retained battle releases (R5)", () => {
  it("replays an old record after adding changed rules and enemy content", async () => {
    const ruleset = { ...RULESET, version: "test-next", pet: { ...RULESET.pet, skillCooldown: 90 } };
    const enemies = { brote: { ...ENEMIES.brote, hpPerAtk: 70 } };
    const contentHash = await sha256Hex(canonicalJson({ ruleset, enemies }));
    const nextReplay = vi.fn((input: ResimInput) => resimulate(input, { ruleset, enemies, contentHash }));
    const releases = [{ rulesetVersion: ruleset.version, contentHash, replay: nextReplay }, ...BATTLE_RELEASES];
    const out = await replayBattle(record, releases);
    expect(nextReplay).not.toHaveBeenCalled();
    expect(out).toEqual({ ok: true, events: normative.events, result: record.result, digest: normative.digest });
    // The next release really differs; this isn't two aliases of the old engine.
    const next = await replayBattle({ ...record, rulesetVersion: ruleset.version, contentHash, inputs: [], result: null }, releases);
    expect(nextReplay).toHaveBeenCalledOnce();
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.digest).not.toBe(normative.digest);
  });

  it("rejects an unknown version or hash, without choosing a nearby release", async () => {
    for (const change of [{ rulesetVersion: "missing" }, { contentHash: "0".repeat(64) }]) {
      expect(await replayBattle({ ...record, ...change })).toEqual({ ok: false, code: "UNKNOWN_RELEASE" });
    }
  });

  it("released content cannot be mutated by a caller", () => {
    expect(() => { RULESET.pet.skillCooldown = 999; }).toThrow();
    expect(() => { ENEMIES.brote.hpPerAtk = 999; }).toThrow();
  });
});
