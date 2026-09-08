import type { Equipment } from "./types";

const WEAPONS = ["sharp_bookmark", "heavy_ink_quill", "librarian_loupe"];
const AMULETS = ["last_page_amulet", "loan_pendant", "streak_medallion"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fields(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return !!d && d.enumerable && "value" in d; });
}
export function isQualityBp(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 8000 && value <= 12000 && value % 1000 === 0;
}
export function isEquipment(value: unknown): value is Equipment {
  if (!fields(value, ["weapon", "amulet"])) return false;
  return (["weapon", "amulet"] as const).every(slot => {
    const c = value[slot];
    return c === null || (fields(c, ["copyId", "itemId", "qualityBp"])
      && typeof c.copyId === "string" && UUID.test(c.copyId) && typeof c.itemId === "string"
      && (slot === "weapon" ? WEAPONS : AMULETS).includes(c.itemId) && isQualityBp(c.qualityBp));
  });
}

/** One final rounding after percent AND quality; no double truncation. */
export function lootBonus(base: number, percent: number, qualityBp: number): number {
  if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(percent) || percent < 0 || !isQualityBp(qualityBp)) throw new Error("INVALID_LOOT_VALUE");
  const result = BigInt(base) * BigInt(percent) * BigInt(qualityBp) / BigInt(1000000);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("LOOT_OVERFLOW");
  return Number(result);
}
export function scaleLootEffect(base: number, qualityBp: number): number { return lootBonus(base, 100, qualityBp); }
