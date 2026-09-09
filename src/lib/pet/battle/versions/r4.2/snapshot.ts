import type { BattleSnapshot } from "./types";
import { isEquipment } from "./equipment";

// Stored r3.1 shape, not today's progression formulas or mutable class catalog.
const ATTRIBUTES = ["FUE", "CON", "INT", "SAB", "CAR", "DES"] as const;
const CLASSES = ["barbarian", "fighter", "wizard", "cleric", "bard", "ranger"];
const STAGES = ["acorn", "young", "adult", "veteran"];
const FIELDS = ["name", "petClass", "stage", "attributes", "tier", "hpMax", "atk", "equipment"];

function hasFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null)
    && Reflect.ownKeys(value).length === fields.length
    && fields.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
    });
}

export function isBattleSnapshot(value: unknown): value is BattleSnapshot {
  if (!hasFields(value, FIELDS)) return false;
  if (!isEquipment(value.equipment)) return false;
  if (typeof value.name !== "string" || typeof value.petClass !== "string"
    || !CLASSES.includes(value.petClass) || typeof value.stage !== "string" || !STAGES.includes(value.stage)) return false;
  for (const key of ["hpMax", "atk", "tier"]) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 1) return false;
  }
  // r3.1 multiplies these values by integer percentages up to 100.
  if (![value.hpMax, value.atk].every((stat) => Number.isSafeInteger((stat as number) * 100))) return false;
  const attrs = value.attributes;
  return hasFields(attrs, ATTRIBUTES)
    && ATTRIBUTES.every((key) => Number.isSafeInteger(attrs[key]) && (attrs[key] as number) >= 0);
}
