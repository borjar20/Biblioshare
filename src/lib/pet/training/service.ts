import { BROTE, ENEMIES, RULESET, contentHash } from "../battle/content";
import { isBattleSnapshot } from "../battle/record";
import { getBattleRelease, replayBattle } from "../battle/replay";
import type { BattleSnapshot } from "../battle/types";
import type { TrainingBattle, TrainingRepository, TrainingResponse } from "./types";

const isIntent = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function createTrainingService(deps: {
  repository: TrainingRepository;
  snapshot: () => Promise<BattleSnapshot | null>;
  seed: () => string;
}) {
  const repo = deps.repository;

  async function saved(battle: TrainingBattle): Promise<TrainingResponse> {
    if (battle.status !== "resolved" || !battle.result || !battle.digest) return { ok: false, code: "NOT_RESOLVED" };
    const replay = await replayBattle(battle);
    if (!replay.ok) return replay;
    if (replay.digest !== battle.digest) return { ok: false, code: "DIGEST_MISMATCH" };
    return { ok: true, battle, events: replay.events };
  }

  return {
    async start(intentId: string, enemyId = BROTE.id): Promise<TrainingResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const existing = await repo.find(intentId);
      if (existing) {
        const release = getBattleRelease(existing.rulesetVersion, existing.contentHash);
        if (!release) return { ok: false, code: "UNKNOWN_RELEASE" };
        if (!release.isSnapshot(existing.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
        return existing.status === "resolved" ? saved(existing) : { ok: true, battle: existing };
      }
      if (typeof enemyId !== "string" || !Object.hasOwn(ENEMIES, enemyId)) return { ok: false, code: "UNKNOWN_ENEMY" };
      const snapshot = await deps.snapshot();
      if (!snapshot) return { ok: false, code: "NO_PET" };
      if (!isBattleSnapshot(snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
      const battle = await repo.insert({
        intentId, status: "open", seed: deps.seed(), snapshot,
        rulesetVersion: RULESET.version, contentHash: await contentHash(), enemyId,
        inputs: [], result: null, digest: null,
      });
      return battle.status === "resolved" ? saved(battle) : { ok: true, battle };
    },

    async resolve(intentId: string, rawInputs: unknown): Promise<TrainingResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const battle = await repo.find(intentId);
      if (!battle) return { ok: false, code: "NOT_FOUND" };
      // A committed result wins even if a retry contains different inputs.
      if (battle.status === "resolved") return saved(battle);
      const release = getBattleRelease(battle.rulesetVersion, battle.contentHash);
      if (!release) return { ok: false, code: "UNKNOWN_RELEASE" };
      const validated = release.validateInputs(rawInputs, battle.enemyId.split(",").length);
      if (!validated.ok) return { ok: false, code: validated.code };
      const out = await replayBattle({ ...battle, inputs: validated.inputs });
      if (!out.ok) return out;
      const resolved: TrainingBattle = {
        ...battle, status: "resolved", inputs: validated.inputs, result: out.result, digest: out.digest,
      };
      const committed = await repo.resolve(resolved);
      if (committed) return { ok: true, battle: committed, events: out.events };
      const winner = await repo.find(intentId);
      return winner ? saved(winner) : { ok: false, code: "NOT_FOUND" };
    },

    async replay(intentId: string): Promise<TrainingResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const battle = await repo.find(intentId);
      return battle ? saved(battle) : { ok: false, code: "NOT_FOUND" };
    },
  };
}
