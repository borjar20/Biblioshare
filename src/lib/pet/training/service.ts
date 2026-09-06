import { BROTE, ENEMIES, RULESET, contentHash } from "../battle/content";
import { validateInputs } from "../battle/inputs";
import { isBattleSnapshot, resimulate } from "../battle/record";
import { replayBattle } from "../battle/replay";
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
    if (!isBattleSnapshot(battle.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
    if (battle.status !== "resolved" || !battle.result || !battle.digest) return { ok: false, code: "NOT_RESOLVED" };
    const replay = await replayBattle(battle);
    if (!replay.ok) return replay;
    if (replay.digest !== battle.digest) return { ok: false, code: "DIGEST_MISMATCH" };
    return { ok: true, battle, events: replay.events };
  }

  return {
    async start(intentId: string): Promise<TrainingResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const existing = await repo.find(intentId);
      if (existing) {
        if (!isBattleSnapshot(existing.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
        return existing.status === "resolved" ? saved(existing) : { ok: true, battle: existing };
      }
      const snapshot = await deps.snapshot();
      if (!snapshot) return { ok: false, code: "NO_PET" };
      if (!isBattleSnapshot(snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
      const battle = await repo.insert({
        intentId, status: "open", seed: deps.seed(), snapshot,
        rulesetVersion: RULESET.version, contentHash: await contentHash(), enemyId: BROTE.id,
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
      const validated = validateInputs(rawInputs, RULESET);
      if (!validated.ok) return { ok: false, code: validated.code };
      const content = { ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() };
      const out = await resimulate({ ...battle, inputs: validated.inputs }, content);
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
