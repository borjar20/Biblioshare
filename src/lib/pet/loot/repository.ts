import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/database.types";
import { copyFromWin } from "./copies";
import type { LootCopy, LootRepository } from "./types";

type Session = Awaited<ReturnType<typeof createClient>>;
type Admin = ReturnType<typeof createServiceRoleClient>;
const PAGE_SIZE = 500;

/** Stable keyset pagination avoids the API row cap and skips no older copies. */
export async function readLootWins(session: Session, userId: string) {
  const rows: { id: string; reward: Json | null; resolved_at: string | null; adventure_day: string | null }[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = session.from("pet_battles").select("id,reward,resolved_at,adventure_day")
      .eq("user_id", userId).eq("kind", "adventure").eq("status", "resolved")
      .eq("result->>outcome", "win").not("reward", "is", null)
      .order("id", { ascending: true }).limit(PAGE_SIZE);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data ?? []);
    if (!data?.length || data.length < PAGE_SIZE) break;
    cursor = data[data.length - 1].id;
  }
  return rows;
}

export async function readLootCopies(session: Session, userId: string): Promise<LootCopy[]> {
  return (await readLootWins(session, userId)).flatMap(row => {
    const copy = copyFromWin(row); return copy ? [copy] : [];
  }).sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt) || a.copyId.localeCompare(b.copyId));
}

export function lootRepository(admin: Admin, session: Session, userId: string): LootRepository {
  return {
    copies: () => readLootCopies(session, userId),
    async selection() {
      const { data, error } = await session.from("pet_loadout").select("weapon_battle_id,amulet_battle_id").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return { weapon: data?.weapon_battle_id ?? null, amulet: data?.amulet_battle_id ?? null };
    },
    async equip(slot, copyId) {
      const { data, error } = await admin.rpc("set_pet_equipment", { p_user: userId, p_slot: slot, p_copy: copyId });
      if (error) throw error;
      if (!data?.[0]) throw new Error("UNAVAILABLE");
      return { weapon: data[0].weapon_battle_id, amulet: data[0].amulet_battle_id };
    },
  };
}
