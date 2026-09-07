import { enemyList, parseEnemyList, pickEnemies } from "../battle/adventure";
import { ENEMIES, RULESET, contentHash } from "../battle/content";
import { isBattleSnapshot } from "../battle/record";
import { getBattleRelease, replayBattle } from "../battle/replay";
import type { BattleSnapshot } from "../battle/types";
import { inventoryFrom, rewardOrder } from "../loot/reward";
import { isIntent, verifyResolved } from "../training/shared";
import type { AdventureBattle, AdventureRepository, AdventureResponse, AdventureState } from "./types";

export function createAdventureService(deps: {
  repository: AdventureRepository;
  snapshot: () => Promise<BattleSnapshot | null>;
  seed: () => string;
  newIntent: () => string;
  /** Efecto tras una victoria confirmada (celebración). Nunca debe lanzar. */
  onWin?: (battle: AdventureBattle) => Promise<void>;
}) {
  const repo = deps.repository;

  async function state(): Promise<AdventureState> {
    const [pendingDays, rows, rewards] = await Promise.all([repo.pendingDays(), repo.recent(60), repo.rewards()]);
    const wonDays = new Set(rows.filter((r) => r.status === "resolved" && r.result?.outcome === "win").map((r) => r.adventure.day));
    const current = rows.find((r) => r.status === "open") ?? rows.find((r) => !wonDays.has(r.adventure.day)) ?? null;
    return { pendingDays, current, inventory: inventoryFrom(rewards) };
  }

  return {
    state,
    async start(): Promise<AdventureResponse> {
      const snapshot = await deps.snapshot();
      if (!snapshot) return { ok: false, code: "NO_PET" };
      if (!isBattleSnapshot(snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
      const seed = deps.seed();
      const battle = await repo.start({
        intentId: deps.newIntent(), seed, enemyId: enemyList(pickEnemies(seed, RULESET.adventure.chainLength, ENEMIES)),
        rulesetVersion: RULESET.version, contentHash: await contentHash(), snapshot,
      });
      if (!battle) return { ok: false, code: "NO_ADVENTURE" };
      if (battle.status === "resolved") return verifyResolved(battle);
      const release = getBattleRelease(battle.rulesetVersion, battle.contentHash);
      if (!release) return { ok: false, code: "UNKNOWN_RELEASE" };
      if (!release.isSnapshot(battle.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
      return { ok: true, battle };
    },
    async resolve(intentId: string, rawInputs: unknown): Promise<AdventureResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const battle = await repo.find(intentId);
      if (!battle) return { ok: false, code: "NOT_FOUND" };
      if (battle.status === "resolved") return verifyResolved(battle);
      const release = getBattleRelease(battle.rulesetVersion, battle.contentHash);
      if (!release) return { ok: false, code: "UNKNOWN_RELEASE" };
      const enemies = parseEnemyList(battle.enemyId, release.enemies);
      if (!enemies) return { ok: false, code: "ENEMIES_MISMATCH" };
      const validated = release.validateInputs(rawInputs, enemies.length);
      if (!validated.ok) return { ok: false, code: validated.code };
      const out = await replayBattle({ ...battle, inputs: validated.inputs });
      if (!out.ok) return out;
      const committed = await repo.resolve({ intentId, inputs: validated.inputs, result: out.result, digest: out.digest, rewardOrder: rewardOrder(battle.seed) });
      if (!committed) return { ok: false, code: "NOT_FOUND" };
      // Otra petición pudo ganar la carrera: lo guardado manda, y se re-verifica igual.
      if (committed.digest !== out.digest) return verifyResolved(committed);
      if (committed.result?.outcome === "win" && deps.onWin) {
        try {
          await deps.onWin(committed);
        } catch (error) {
          console.error("pet adventure onWin", error);
        }
      }
      return { ok: true, battle: committed, events: out.events };
    },
    async replay(intentId: string): Promise<AdventureResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const battle = await repo.find(intentId);
      return battle ? verifyResolved(battle) : { ok: false, code: "NOT_FOUND" };
    },
  };
}
