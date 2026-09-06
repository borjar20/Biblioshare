// Validation at the current API boundary; retained release code stays immutable.
import { resimulate as simulateReleased } from "./versions/r2.2/record";
import type { ResimError as ReleasedError, ResimInput, BattleContent } from "./versions/r2.2/record";
import { validateInputs } from "./inputs";
import { isBattleSnapshot } from "./snapshot";
export { battleDigest, digestMaterial } from "./versions/r2.2/record";
export type { ResimInput, BattleContent } from "./versions/r2.2/record";
export type ResimError = ReleasedError | "INVALID_SNAPSHOT";

export async function resimulate(record: ResimInput, content: BattleContent) {
  if (!isBattleSnapshot(record.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" } as const;
  const inputs = validateInputs(record.inputs, content.ruleset);
  if (!inputs.ok) return { ok: false, code: "INVALID_INPUTS" } as const;
  return simulateReleased(record, content);
}
