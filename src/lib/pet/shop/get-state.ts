import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { shopRepository } from "./repository";
import { createShopService } from "./service";
import type { ShopState } from "./types";

/** Sin cliente de sesión: la autorización la hace la página, que ya resolvió
 * quién es el usuario, y la lectura entera vive en una función `definer`. */
export async function getShopStateFor(userId: string): Promise<ShopState> {
  return createShopService(shopRepository(createServiceRoleClient(), userId)).state();
}
