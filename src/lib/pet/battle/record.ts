// Registro de combate (C9, C10): lo que persiste pet_battles y lo que firma el
// digest. El digest se calcula sobre el registro MÁS los eventos re-simulados y
// nunca contiene un digest: sin circularidad por construcción (#1081 R5).
// `resimulate` es lo que hace el servidor en R2 y el CLI en `replay`.
import { canonicalJson } from "./canonical";
import { simulate } from "./engine";
import { sha256Hex } from "./hash";
import { validateInputs } from "./inputs";
import { isSeed } from "./prng";
import type { BattleEvent, BattleRecord, BattleResult, EnemyDef, Ruleset } from "./types";

export function digestMaterial(record: BattleRecord, events: readonly BattleEvent[]): string {
  return canonicalJson({ ...record, events });
}

export async function battleDigest(record: BattleRecord, events: readonly BattleEvent[]): Promise<string> {
  return sha256Hex(digestMaterial(record, events));
}

export type ResimError =
  | "UNKNOWN_ENEMY"
  | "RULESET_MISMATCH"
  | "CONTENT_MISMATCH"
  | "INVALID_SEED"
  | "INVALID_INPUTS"
  | "INPUTS_AFTER_END"
  | "RESULT_MISMATCH";

export interface BattleContent {
  ruleset: Ruleset;
  enemies: Record<string, EnemyDef>;
  contentHash: string;
}

export async function resimulate(
  record: BattleRecord,
  content: BattleContent,
): Promise<{ ok: true; events: BattleEvent[]; result: BattleResult; digest: string } | { ok: false; code: ResimError }> {
  const enemy = content.enemies[record.enemyId];
  if (!enemy) return { ok: false, code: "UNKNOWN_ENEMY" };
  if (record.rulesetVersion !== content.ruleset.version) return { ok: false, code: "RULESET_MISMATCH" };
  if (record.contentHash !== content.contentHash) return { ok: false, code: "CONTENT_MISMATCH" };
  if (!isSeed(record.seed) || record.seed === "0".repeat(32)) return { ok: false, code: "INVALID_SEED" };
  const validated = validateInputs(record.inputs, content.ruleset);
  if (!validated.ok) return { ok: false, code: "INVALID_INPUTS" };
  let sim: { events: BattleEvent[]; result: BattleResult };
  try {
    sim = simulate({ seed: record.seed, snapshot: record.snapshot, enemy, ruleset: content.ruleset }, validated.inputs);
  } catch {
    return { ok: false, code: "INPUTS_AFTER_END" };
  }
  if (canonicalJson(sim.result) !== canonicalJson(record.result)) return { ok: false, code: "RESULT_MISMATCH" };
  const digest = await battleDigest({ ...record, inputs: validated.inputs }, sim.events);
  return { ok: true, events: sim.events, result: sim.result, digest };
}
