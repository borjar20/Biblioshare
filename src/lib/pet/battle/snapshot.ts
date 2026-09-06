import type { BattleSnapshot } from "./types";

// Stored r2.2 shape, not today's progression formulas or mutable class catalog.
const ATTRIBUTES = ["FUE", "CON", "INT", "SAB", "CAR", "DES"] as const;
const CLASSES = ["barbarian", "fighter", "wizard", "cleric", "bard", "ranger"];
const STAGES = ["acorn", "young", "adult", "veteran"];
const FIELDS = ["name", "petClass", "stage", "attributes", "tier", "hpMax", "atk"];

function hasFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null)
    && Reflect.ownKeys(value).length === fields.length
    && fields.every((key) => Object.hasOwn(value, key));
}

export function isBattleSnapshot(value: unknown): value is BattleSnapshot {
  if (!hasFields(value, FIELDS)) return false;
  if (typeof value.name !== "string" || typeof value.petClass !== "string"
    || !CLASSES.includes(value.petClass) || typeof value.stage !== "string" || !STAGES.includes(value.stage)) return false;
  for (const key of ["hpMax", "atk", "tier"]) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) return false;
  }
  const attrs = value.attributes;
  return hasFields(attrs, ATTRIBUTES)
    && ATTRIBUTES.every((key) => Number.isSafeInteger(attrs[key]) && (attrs[key] as number) >= 0);
}
