// Registro de combate (C9, C10): lo que persiste pet_battles y lo que firma el
// digest. El digest se calcula sobre el registro MÁS los eventos re-simulados y
// nunca contiene un digest: sin circularidad por construcción (#1081 R5).
// `resimulate` es lo que hace el servidor en R2 y el CLI en `replay`; `result`
// es opcional: el servidor de R2 lo produce; el replay y la auditoría lo verifican.
import { canonicalJson } from "./canonical";
import { simulate } from "./engine";
import { sha256Hex } from "./hash";
import { validateInputs } from "./inputs";
import { isSeed } from "./prng";
import type { BattleEvent, BattleRecord, BattleResult, EnemyDef, Ruleset } from "./types";

export function digestMaterial(record: BattleRecord, events: readonly BattleEvent[]): string {
  // Los siete campos, proyectados uno a uno: una fila de pet_battles llega con
  // id, user_id, status o un digest guardado, y nada de eso firma el combate.
  return canonicalJson({
    rulesetVersion: record.rulesetVersion,
    contentHash: record.contentHash,
    enemyId: record.enemyId,
    seed: record.seed,
    snapshot: record.snapshot,
    inputs: record.inputs,
    result: record.result,
    events,
  });
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

/** Lo que acepta `resimulate`: el registro con `result` opcional. El servidor de R2
 *  resuelve el combate desde los inputs y todavía no tiene resultado (C1); el replay
 *  y la auditoría sí lo traen, y entonces se verifica. `result` ausente o `null` (fila
 *  `open`): el servidor lo produce; presente: se verifica. */
export type ResimInput = Omit<BattleRecord, "result"> & { result?: BattleResult | null };

export async function resimulate(
  record: ResimInput,
  content: BattleContent,
): Promise<{ ok: true; events: BattleEvent[]; result: BattleResult; digest: string } | { ok: false; code: ResimError }> {
  // Una búsqueda en un objeto plano con una clave que llega del cliente debe
  // ignorar las propiedades heredadas (__proto__, constructor, toString...).
  const enemy = Object.hasOwn(content.enemies, record.enemyId) ? content.enemies[record.enemyId] : undefined;
  if (!enemy) return { ok: false, code: "UNKNOWN_ENEMY" };
  if (record.rulesetVersion !== content.ruleset.version) return { ok: false, code: "RULESET_MISMATCH" };
  if (record.contentHash !== content.contentHash) return { ok: false, code: "CONTENT_MISMATCH" };
  if (!isSeed(record.seed) || record.seed === "0".repeat(32)) return { ok: false, code: "INVALID_SEED" };
  // `snapshot` no se valida aquí: lo escribe el servidor al crear el combate (C10)
  // y nunca viene del cliente; un snapshot malformado es un bug del servidor, no
  // una entrada hostil.
  const validated = validateInputs(record.inputs, content.ruleset);
  if (!validated.ok) return { ok: false, code: "INVALID_INPUTS" };
  let sim: { events: BattleEvent[]; result: BattleResult };
  try {
    sim = simulate({ seed: record.seed, snapshot: record.snapshot, enemy, ruleset: content.ruleset }, validated.inputs);
  } catch (e) {
    if (e instanceof Error && e.message === "INPUTS_AFTER_END") return { ok: false, code: "INPUTS_AFTER_END" };
    throw e;
  }
  // Sin `result` no hay nada que comparar: el resultado ES el de esta simulación.
  if (record.result != null) {
    // El resultado del cliente puede no ser canónico (p. ej. un número no
    // entero): eso no es un bug del servidor, es un registro que no encaja.
    let recordResultJson: string;
    try {
      recordResultJson = canonicalJson(record.result);
    } catch {
      return { ok: false, code: "RESULT_MISMATCH" };
    }
    if (canonicalJson(sim.result) !== recordResultJson) return { ok: false, code: "RESULT_MISMATCH" };
  }
  // Misma proyección de los siete campos que `digestMaterial`, con los inputs
  // copiados y el resultado re-simulado: es sobre eso sobre lo que se firma.
  const digest = await battleDigest(
    {
      rulesetVersion: record.rulesetVersion,
      contentHash: record.contentHash,
      enemyId: record.enemyId,
      seed: record.seed,
      snapshot: record.snapshot,
      inputs: validated.inputs,
      result: sim.result,
    },
    sim.events,
  );
  return { ok: true, events: sim.events, result: sim.result, digest };
}
