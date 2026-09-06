// Harden the current boundary while keeping the released replay executable intact.
import { isPetClass, PET_ATTRIBUTES } from "../classes";
import { validateInputs } from "./inputs";
import type { BattleSnapshot } from "./types";
import {
  resimulate as releasedResimulate,
  type BattleContent,
  type ResimError as ReleasedResimError,
  type ResimInput,
} from "./versions/r2.2/record";

export { battleDigest, digestMaterial } from "./versions/r2.2/record";
export type { BattleContent, ResimInput } from "./versions/r2.2/record";
export type ResimError = ReleasedResimError | "INVALID_SNAPSHOT";

function hasExactDataKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

/** Validate persisted snapshots before either simulation or canonical digesting. */
export function isBattleSnapshot(value: unknown): value is BattleSnapshot {
  if (!hasExactDataKeys(value, ["name", "petClass", "stage", "attributes", "tier", "hpMax", "atk"])) return false;
  if (typeof value.name !== "string" || !isPetClass(value.petClass)) return false;
  if (!["acorn", "young", "adult", "veteran"].includes(value.stage as string)) return false;
  if (![value.hpMax, value.atk, value.tier].every((stat) => Number.isSafeInteger(stat) && (stat as number) >= 1)) return false;
  // R2 uses integer percentage products (up to 100) and enemy HP = 42 × atk.
  // Valid source integers alone do not guarantee exact intermediate arithmetic.
  if (![value.hpMax, value.atk].every((stat) => Number.isSafeInteger((stat as number) * 100))) return false;
  const attributes = value.attributes;
  return hasExactDataKeys(attributes, PET_ATTRIBUTES)
    && PET_ATTRIBUTES.every((key) => Number.isSafeInteger(attributes[key]) && (attributes[key] as number) >= 0);
}

export async function resimulate(
  record: ResimInput,
  content: BattleContent,
): Promise<Awaited<ReturnType<typeof releasedResimulate>> | { ok: false; code: "INVALID_SNAPSHOT" }> {
  if (!isBattleSnapshot(record.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
  const validated = validateInputs(record.inputs, content.ruleset);
  if (!validated.ok) return { ok: false, code: "INVALID_INPUTS" };
  return releasedResimulate({ ...record, inputs: validated.inputs }, content);
}
