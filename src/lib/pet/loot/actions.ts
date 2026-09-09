"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidatePetPage } from "@/lib/reactivity/revalidate";
import { lootRepository } from "./repository";
import { createLootService } from "./service";
import type { LoadoutResponse } from "./types";

export async function equipLoot(slot: unknown, copyId: unknown): Promise<LoadoutResponse> {
  try {
    const session = await createClient();
    const { data: { user }, error } = await session.auth.getUser();
    if (error || !user) return { ok: false, code: "UNAUTHENTICATED" };
    const response = await createLootService(lootRepository(createServiceRoleClient(), session, user.id)).equip(slot, copyId);
    if (response.ok) revalidatePetPage();
    return response;
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}
