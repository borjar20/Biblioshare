import { DEFAULT_SCENE_ID, isCampSceneId, scenePrice } from "./catalog";
import type { BuyResponse, ClaimResponse, SceneResponse, ShopErrorCode, ShopRepository } from "./types";

function codeFrom(error: unknown): ShopErrorCode {
  const message = typeof error === "object" && error !== null && "message" in error ? error.message : null;
  return message === "NOT_ENOUGH" || message === "NOT_OWNED" || message === "NO_PET" ? message : "UNAVAILABLE";
}

export function createShopService(repo: ShopRepository) {
  return {
    state: () => repo.state(),
    async claim(): Promise<ClaimResponse> {
      try {
        const entries = await repo.claim();
        return { ok: true, entries, state: await repo.state() };
      } catch (error) { return { ok: false, code: codeFrom(error) }; }
    },
    async buy(cosmeticId: unknown): Promise<BuyResponse> {
      if (!isCampSceneId(cosmeticId)) return { ok: false, code: "UNKNOWN_COSMETIC" };
      // El precio sale del catálogo, nunca del cliente.
      const price = scenePrice(cosmeticId);
      if (price <= 0) return { ok: false, code: "UNKNOWN_COSMETIC" };
      try {
        await repo.buy(cosmeticId, price);
        return { ok: true, state: await repo.state() };
      } catch (error) { return { ok: false, code: codeFrom(error) }; }
    },
    async setScene(cosmeticId: unknown): Promise<SceneResponse> {
      if (!isCampSceneId(cosmeticId)) return { ok: false, code: "UNKNOWN_COSMETIC" };
      // La escena de siempre es gratis y no tiene desbloqueo: se guarda como null.
      const value = cosmeticId === DEFAULT_SCENE_ID ? null : cosmeticId;
      try {
        await repo.setScene(value);
        return { ok: true, state: await repo.state() };
      } catch (error) { return { ok: false, code: codeFrom(error) }; }
    },
  };
}
