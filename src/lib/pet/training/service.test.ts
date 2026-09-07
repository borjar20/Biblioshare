import { describe, expect, it } from "vitest";
import { createTrainingService } from "./service";
import type { TrainingBattle, TrainingRepository } from "./types";
import { snapshotForProfile } from "../battle/profiles";
import { seedFromIndex } from "../battle/prng";
import { BROTE, RULESET } from "../battle/content";
import { POLICIES, runPolicy } from "../battle/policies";
import { contentHash as r2ContentHash } from "../battle/versions/r2.2/content";

const intent = "54e5f63c-68a8-4acf-a790-6938580d48a5";
function setup() {
  const rows = new Map<string, TrainingBattle>();
  let writes = 0;
  let seedCalls = 0;
  const repository: TrainingRepository = {
    async find(id) { return structuredClone(rows.get(id) ?? null); },
    async insert(battle) {
      if (!rows.has(battle.intentId)) { rows.set(battle.intentId, structuredClone(battle)); writes++; }
      return structuredClone(rows.get(battle.intentId)!);
    },
    async resolve(battle) {
      if (rows.get(battle.intentId)?.status !== "open") return null;
      rows.set(battle.intentId, structuredClone(battle)); writes++;
      return structuredClone(battle);
    },
  };
  const service = createTrainingService({
    repository,
    snapshot: async () => snapshotForProfile("social", "bard"),
    seed: () => seedFromIndex(++seedCalls),
  });
  return { service, rows, writes: () => writes, seedCalls: () => seedCalls };
}

describe("training authority", () => {
  it("retrying start preserves the first seed and snapshot without deriving again", async () => {
    const s = setup();
    const first = await s.service.start(intent);
    expect(first.ok).toBe(true);
    expect(await s.service.start(intent)).toEqual(first);
    expect(s.seedCalls()).toBe(1);
    expect(s.writes()).toBe(1);
  });
  it("the first intent fixes the enemy even when a retry asks for another", async () => {
    const s = setup();
    const first = await s.service.start(intent, "caparazon");
    expect(first.ok && first.battle.enemyId).toBe("caparazon");
    expect(await s.service.start(intent, "brote")).toEqual(first);
    expect(s.writes()).toBe(1);
  });
  it("rejects unknown and inherited enemy ids before creating a battle", async () => {
    const s = setup();
    for (const id of ["unknown", "__proto__", "constructor"]) {
      expect(await s.service.start(intent, id)).toEqual({ ok: false, code: "UNKNOWN_ENEMY" });
    }
    expect(s.writes()).toBe(0);
  });
  it("concurrent starts converge on one battle", async () => {
    const s = setup();
    const [a, b] = await Promise.all([s.service.start(intent), s.service.start(intent)]);
    expect(a).toEqual(b);
    expect(s.rows.size).toBe(1);
    expect(s.writes()).toBe(1);
  });
  it("rejects invalid intents and missing battles without writing", async () => {
    const s = setup();
    expect(await s.service.start("bad")).toEqual({ ok: false, code: "INVALID_INTENT" });
    expect(await s.service.resolve(intent, [])).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(s.writes()).toBe(0);
  });
  it("nonempty payload never reaches persistence", async () => {
    const s = setup();
    await s.service.start(intent);
    expect(await s.service.resolve(intent, [{ seq: 0, tick: 0, action: "skill", payload: { x: "z".repeat(5000) } }]))
      .toEqual({ ok: false, code: "NONEMPTY_PAYLOAD" });
    expect(s.writes()).toBe(1);
    expect(s.rows.get(intent)?.status).toBe("open");
  });
  it("concurrent different logs keep exactly the first committed resolution", async () => {
    const s = setup();
    const started = await s.service.start(intent);
    if (!started.ok) throw Error(started.code);
    const b = started.battle;
    const run = runPolicy({ seed: b.seed, snapshot: b.snapshot, enemies: [BROTE], ruleset: RULESET }, POLICIES.interrupt);
    const [a, other] = await Promise.all([s.service.resolve(intent, []), s.service.resolve(intent, run.inputs)]);
    expect(a.ok).toBe(true);
    expect(other).toEqual(a);
    expect(s.writes()).toBe(2);
    expect(await s.service.resolve(intent, "ignored on retry")).toEqual(a);
  });
  it("replay derives identical events and verifies the persisted digest", async () => {
    const s = setup();
    await s.service.start(intent);
    const resolved = await s.service.resolve(intent, []);
    const replay = await s.service.replay(intent);
    expect(replay).toEqual(resolved);
    s.rows.get(intent)!.digest = "0".repeat(64);
    expect(await s.service.replay(intent)).toEqual({ ok: false, code: "DIGEST_MISMATCH" });
  });
  it("invalid stored snapshot returns a domain error without writing", async () => {
    const s = setup();
    await s.service.start(intent);
    s.rows.get(intent)!.snapshot.atk = "x" as unknown as number;
    expect(await s.service.resolve(intent, [])).toEqual({ ok: false, code: "INVALID_SNAPSHOT" });
    expect(s.writes()).toBe(1);
  });
  it("resolves an open R2 battle using its stored release after R3 is current", async () => {
    const s = setup();
    await s.service.start(intent);
    const historical = s.rows.get(intent)!;
    historical.rulesetVersion = "r2.2";
    historical.contentHash = await r2ContentHash();
    expect(await s.service.resolve(intent, [{ seq: 0, tick: 0, action: "skill", payload: { score: 100 } }]))
      .toEqual({ ok: false, code: "NONEMPTY_PAYLOAD" });
    const resolved = await s.service.resolve(intent, []);
    expect(resolved.ok && resolved.battle.rulesetVersion).toBe("r2.2");
    expect(await s.service.replay(intent)).toEqual(resolved);
  });
  it("an early or forged ultimate cannot persist a result", async () => {
    const s = setup();
    await s.service.start(intent, "caparazon");
    for (const payload of [{ order: "0123" }, { order: "0123", score: 100 }, { order: "0000" }]) {
      const response = await s.service.resolve(intent, [{ seq: 0, tick: 0, action: "ulti", payload }]);
      expect(response.ok).toBe(false);
      expect(s.rows.get(intent)?.status).toBe("open");
    }
    expect(s.writes()).toBe(1);
  });
  it("skipping a ready ultimate is authoritative and replayable", async () => {
    const s = setup();
    await s.service.start(intent, "caparazon");
    const response = await s.service.resolve(intent, [{ seq: 0, tick: 120, action: "ulti", payload: { order: "" } }]);
    expect(response.ok).toBe(true);
    if (!response.ok) throw Error(response.code);
    expect(response.events?.some(event => event.type === "ULTI_USED" && event.damage > 0)).toBe(true);
    expect(await s.service.replay(intent)).toEqual(response);
  });
});
