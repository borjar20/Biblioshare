"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidatePetPage } from "@/lib/reactivity/revalidate";
import { shopRepository } from "./repository";
import { createShopService } from "./service";
import type { BuyResponse, ClaimResponse, SceneResponse } from "./types";

async function serviceForCaller() {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return null;
  return createShopService(shopRepository(createServiceRoleClient(), user.id));
}

export async function claimAcorns(): Promise<ClaimResponse> {
  try {
    const service = await serviceForCaller();
    if (!service) return { ok: false, code: "UNAUTHENTICATED" };
    const response = await service.claim();
    if (response.ok) revalidatePetPage();
    return response;
  } catch { return { ok: false, code: "UNAVAILABLE" }; }
}

export async function buyCosmetic(cosmeticId: unknown): Promise<BuyResponse> {
  try {
    const service = await serviceForCaller();
    if (!service) return { ok: false, code: "UNAUTHENTICATED" };
    const response = await service.buy(cosmeticId);
    if (response.ok) revalidatePetPage();
    return response;
  } catch { return { ok: false, code: "UNAVAILABLE" }; }
}

export async function setCampScene(cosmeticId: unknown): Promise<SceneResponse> {
  try {
    const service = await serviceForCaller();
    if (!service) return { ok: false, code: "UNAUTHENTICATED" };
    const response = await service.setScene(cosmeticId);
    if (response.ok) revalidatePetPage();
    return response;
  } catch { return { ok: false, code: "UNAVAILABLE" }; }
}
