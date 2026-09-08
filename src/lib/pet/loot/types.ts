import type { LootItemId, LootSlot } from "./catalog";

export interface LootCopy {
  copyId: string;
  itemId: LootItemId;
  slot: LootSlot;
  qualityBp: number;
  acquiredAt: string;
}

export interface PetLoadout { weapon: LootCopy | null; amulet: LootCopy | null }
export type LoadoutResponse =
  | { ok: true; loadout: PetLoadout }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID_SLOT" | "INVALID_COPY" | "NOT_OWNED" | "WRONG_SLOT" | "UNAVAILABLE" };
