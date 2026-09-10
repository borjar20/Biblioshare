import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ACORN_EPOCH, ACORN_RATES, isCampSceneId, type AcornKind } from "./catalog";
import type { ClaimedEntry, ShopRepository, ShopState } from "./types";

type Admin = ReturnType<typeof createServiceRoleClient>;

function kindOf(key: string): AcornKind {
  if (key === "welcome") return "welcome";
  if (key.startsWith("day:")) return "day";
  if (key.startsWith("mission:")) return "mission";
  return "achievement";
}

/** Sin cliente de sesión, al contrario que los demás repositorios de mascota:
 * TODO el estado sale de una sola función `definer`, porque los pendientes
 * necesitan `private.pet_lived_activity_days` y PostgREST no sabe sumar el saldo.
 * Un parámetro que no se usa es una mentira sobre lo que esto lee. */
export function shopRepository(admin: Admin, userId: string): ShopRepository {
  async function state(): Promise<ShopState> {
    const { data, error } = await admin.rpc("pet_acorn_state", { p_user: userId, p_epoch: ACORN_EPOCH });
    if (error) throw error;
    const value = (data ?? {}) as { balance?: number; pending?: { kind: AcornKind; key: string }[]; owned?: string[]; scene?: string | null };
    // Un id retirado del catálogo (o corrompido en la fila) no debe propagarse:
    // `campScene()` LANZA con un id desconocido y `pet-game.tsx` la llama sin
    // red, así que un id inválido aquí tumbaría ficha, madriguera y
    // entrenamiento enteros, no solo el fondo (issue de revisión, Important).
    // Se lee como si nunca se hubiera elegido escena: la de siempre.
    return {
      balance: value.balance ?? 0,
      pending: value.pending ?? [],
      owned: value.owned ?? [],
      scene: isCampSceneId(value.scene) ? value.scene : null,
    };
  }
  return {
    state,
    async claim(): Promise<ClaimedEntry[]> {
      const { data, error } = await admin.rpc("claim_pet_acorns", { p_user: userId, p_epoch: ACORN_EPOCH, p_rates: ACORN_RATES });
      if (error) throw error;
      return (data ?? []).map(row => ({ key: row.source_key, kind: kindOf(row.source_key), amount: row.amount }));
    },
    async buy(cosmeticId, price) {
      const { error } = await admin.rpc("buy_pet_cosmetic", { p_user: userId, p_cosmetic: cosmeticId, p_price: price });
      if (error) throw new Error(error.message.includes("NOT_ENOUGH") ? "NOT_ENOUGH" : error.message);
    },
    async setScene(cosmeticId) {
      const { error } = await admin.rpc("set_pet_camp_scene", { p_user: userId, p_scene: cosmeticId });
      if (error) throw new Error(error.message.includes("NOT_OWNED") ? "NOT_OWNED" : error.message.includes("NO_PET") ? "NO_PET" : error.message);
    },
  };
}
