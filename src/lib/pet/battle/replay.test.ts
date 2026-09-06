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
  it("lets the selected future release validate its own snapshot shape", async () => {
    const futureReplay = vi.fn().mockResolvedValue({ ok: false, code: "FUTURE_SNAPSHOT" });
    const future = { ...record, rulesetVersion: "future", contentHash: "future-hash", snapshot: { futureField: 1 } } as unknown as ResimInput;
    const releases = [{ rulesetVersion: "future", contentHash: "future-hash", replay: futureReplay }, ...BATTLE_RELEASES];
    await expect(replayBattle(future, releases)).resolves.toEqual({ ok: false, code: "FUTURE_SNAPSHOT" });
    expect(futureReplay).toHaveBeenCalledWith(future);
  });

  it("validates r2.2 even when its adapter is called directly", async () => {
    const release = BATTLE_RELEASES.find((entry) => entry.rulesetVersion === "r2.2")!;
    await expect(release.replay({ ...record, snapshot: null } as unknown as ResimInput))
      .resolves.toEqual({ ok: false, code: "INVALID_SNAPSHOT" });
  });
  it.each(["atk", "hpMax"])("rejects %s that overflows derived battle arithmetic", async (key) => {
    await expect(replayBattle({ ...record, result: null, inputs: [], snapshot: { ...record.snapshot, [key]: Number.MAX_SAFE_INTEGER } }))
      .resolves.toEqual({ ok: false, code: "INVALID_SNAPSHOT" });
  });
  it.each([
    null, {}, { ...record.snapshot, atk: -1 },
    { ...record.snapshot, atk: Number.MAX_SAFE_INTEGER },
    { ...record.snapshot, hpMax: Number.MAX_SAFE_INTEGER },
  ])("rejects malformed persisted snapshots without throwing: %#", async (snapshot) => {
    await expect(replayBattle({ ...record, snapshot } as ResimInput))
      .resolves.toEqual({ ok: false, code: "INVALID_SNAPSHOT" });
  });

  it("retains historical nonempty payload semantics", async () => {
    const historical = { ...record, result: null, inputs: [{ seq: 0, tick: 0, action: "skill" as const, payload: { legacy: "value" } }] };
    const out = await replayBattle(historical);
    expect(out.ok).toBe(true);
  });

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

it("rechaza un snapshot histórico roto con un código de dominio", async () => {
  await expect(replayBattle({ ...record, snapshot: { ...record.snapshot, atk: "x" } } as unknown as ResimInput))
    .resolves.toEqual({ ok: false, code: "INVALID_SNAPSHOT" });
});
