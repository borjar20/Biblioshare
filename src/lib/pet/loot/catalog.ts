// Catálogo de botín de R4a (spec §7). Sin efecto en combate hasta R4b: los ids son
// estables y el comentario de cada uno es la dirección prevista, para que R4b no renombre.
export const LOOT_SLOTS = ["weapon", "amulet"] as const;
export type LootSlot = (typeof LOOT_SLOTS)[number];

export const LOOT_ITEMS = [
  { id: "sharp_bookmark", slot: "weapon" },    // R4b: la interrupción pega más
  { id: "heavy_ink_quill", slot: "weapon" },   // R4b: la ulti de Potencia pega más
  { id: "librarian_loupe", slot: "weapon" },   // R4b: la ventana vulnerable dura más
  { id: "last_page_amulet", slot: "amulet" },  // R4b: usar la ulti concede una barrera pequeña
  { id: "loan_pendant", slot: "amulet" },      // R4b: la habilidad recarga antes tras interrumpir
  { id: "streak_medallion", slot: "amulet" },  // R4b: empezar cada tramo con algo de vida extra
] as const satisfies readonly { id: string; slot: LootSlot }[];

export type LootItemId = (typeof LOOT_ITEMS)[number]["id"];
export interface LootItem { id: LootItemId; slot: LootSlot }
export type Reward = { itemId: LootItemId; slot: LootSlot } & (
  | { qualityBp?: never; qualityVersion?: never }
  | { qualityBp: number; qualityVersion: 1 }
);

export function isQualityBp(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 8000 && value <= 12000 && value % 1000 === 0;
}

export function isLootItemId(x: unknown): x is LootItemId {
  return typeof x === "string" && LOOT_ITEMS.some((i) => i.id === x);
}
export function isReward(x: unknown): x is Reward {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  const legacy = !Object.hasOwn(r, "qualityBp") && !Object.hasOwn(r, "qualityVersion");
  return isLootItemId(r.itemId) && LOOT_ITEMS.some((i) => i.id === r.itemId && i.slot === r.slot)
    && (legacy || (r.qualityVersion === 1 && isQualityBp(r.qualityBp)));
}
