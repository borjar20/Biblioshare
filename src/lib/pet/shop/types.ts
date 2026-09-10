import type { AcornKind } from "./catalog";

export interface AcornFact { kind: AcornKind; key: string }
export interface ShopState {
  balance: number;
  pending: AcornFact[];
  owned: string[];
  /** `null` = la escena de siempre. */
  scene: string | null;
}
export interface ClaimedEntry { key: string; kind: AcornKind; amount: number }
export type ShopErrorCode =
  | "UNAUTHENTICATED" | "UNKNOWN_COSMETIC" | "NOT_ENOUGH" | "NOT_OWNED" | "NO_PET" | "UNAVAILABLE";
export type ClaimResponse =
  | { ok: true; entries: ClaimedEntry[]; state: ShopState }
  | { ok: false; code: ShopErrorCode };
export type BuyResponse = { ok: true; state: ShopState } | { ok: false; code: ShopErrorCode };
export type SceneResponse = { ok: true; state: ShopState } | { ok: false; code: ShopErrorCode };

/** Construir solo tras autenticar: el repositorio está atado a ese usuario. */
export interface ShopRepository {
  state(): Promise<ShopState>;
  claim(): Promise<ClaimedEntry[]>;
  buy(cosmeticId: string, price: number): Promise<void>;
  setScene(cosmeticId: string | null): Promise<void>;
}
