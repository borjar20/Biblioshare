import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import { isReward } from "../loot/catalog";
import { copyFromWin } from "../loot/copies";
import { lootRepository, readLootWins } from "../loot/repository";
import type { AdventureBattle, AdventureRepository } from "./types";

type Admin = ReturnType<typeof createServiceRoleClient>;
type Session = Awaited<ReturnType<typeof createClient>>;
type Row = Database["public"]["Tables"]["pet_battles"]["Row"];

function project(row: Row): AdventureBattle {
  const reward = isReward(row.reward) ? row.reward : null;
  return {
    intentId: row.intent_id, status: row.status as AdventureBattle["status"], seed: row.seed,
    snapshot: row.snapshot as unknown as AdventureBattle["snapshot"], rulesetVersion: row.ruleset_version,
    contentHash: row.content_hash, enemyId: row.enemy_id, inputs: (row.inputs ?? []) as unknown as AdventureBattle["inputs"],
    result: row.result as unknown as AdventureBattle["result"], digest: row.digest,
    adventure: { day: row.adventure_day ?? "", attempt: row.attempt ?? 1, reward, copy: row.result && typeof row.result === "object" && !Array.isArray(row.result) && row.result.outcome === "win" ? copyFromWin(row) : null },
  };
}

/** `session` (cliente de la petición, RLS) lee la concesión; `admin` (service_role) llama a las funciones de escritura. */
export function adventureRepository(admin: Admin, session: Session, userId: string): AdventureRepository {
  return {
    selection: () => lootRepository(admin, session, userId).selection(),
    async pendingDays() {
      const { data, error } = await session.rpc("get_pet_adventure_days");
      if (error) throw error;
      return (data ?? []).map((r) => r.day);
    },
    async find(intentId) {
      const { data, error } = await admin.from("pet_battles").select("*").eq("user_id", userId).eq("intent_id", intentId).eq("kind", "adventure").maybeSingle();
      if (error) throw error;
      return data ? project(data) : null;
    },
    async recent(limit) {
      const { data, error } = await admin.from("pet_battles").select("*").eq("user_id", userId).eq("kind", "adventure").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map(project);
    },
    async wins() {
      return (await readLootWins(session, userId)).map(r => ({ day: r.adventure_day ?? "", reward: isReward(r.reward) ? r.reward : null, copy: copyFromWin(r) }));
    },
    async start(input) {
      const { data, error } = await admin.rpc("start_pet_adventure", {
        p_user: userId, p_seed: input.seed, p_intent: input.intentId, p_enemies: input.enemyId,
        p_ruleset_version: input.rulesetVersion, p_content_hash: input.contentHash, p_snapshot: input.snapshot as unknown as Json,
      });
      if (error) throw error;
      return data?.[0] ? project(data[0]) : null;
    },
    async resolve(input) {
      const { data, error } = await admin.rpc("resolve_pet_adventure", {
        p_user: userId, p_intent: input.intentId, p_inputs: input.inputs as unknown as Json, p_result: input.result as unknown as Json,
        p_digest: input.digest, p_reward_order: input.rewardOrder as unknown as Json,
      });
      if (error) throw error;
      return data?.[0] ? project(data[0]) : null;
    },
  };
}
