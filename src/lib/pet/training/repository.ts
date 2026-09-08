import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { TrainingBattle, TrainingRepository } from "./types";

type Client = ReturnType<typeof createServiceRoleClient>;
type Row = Database["public"]["Tables"]["pet_battles"]["Row"];

function project(row: Row): TrainingBattle {
  return {
    intentId: row.intent_id, status: row.status as TrainingBattle["status"],
    seed: row.seed, snapshot: row.snapshot as unknown as TrainingBattle["snapshot"],
    rulesetVersion: row.ruleset_version, contentHash: row.content_hash, enemyId: row.enemy_id,
    inputs: (row.inputs ?? []) as unknown as TrainingBattle["inputs"],
    result: row.result as unknown as TrainingBattle["result"], digest: row.digest,
  };
}

export function trainingRepository(client: Client, userId: string): TrainingRepository {
  const find: TrainingRepository["find"] = async (intentId) => {
    const { data, error } = await client.from("pet_battles").select("*")
      .eq("user_id", userId).eq("intent_id", intentId).eq("kind", "training").maybeSingle();
    if (error) throw error;
    return data ? project(data) : null;
  };
  return {
    find,
    async insert(battle) {
      const { data, error } = await client.rpc("start_pet_training", {
        p_user: userId, p_intent: battle.intentId, p_enemy: battle.enemyId,
        p_ruleset_version: battle.rulesetVersion, p_content_hash: battle.contentHash, p_seed: battle.seed,
        p_snapshot: battle.snapshot as unknown as Json,
      });
      if (error) throw error;
      if (!data?.[0]) throw new Error("UNAVAILABLE");
      return project(data[0]);
    },
    async resolve(battle) {
      // Atomic first-writer-wins. Never update a resolved combat or its snapshot.
      const { data, error } = await client.from("pet_battles").update({
        status: "resolved", inputs: battle.inputs as unknown as Json,
        result: battle.result as unknown as Json, digest: battle.digest, resolved_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("intent_id", battle.intentId).eq("kind", "training")
        .eq("status", "open").select("*").maybeSingle();
      if (error) throw error;
      return data ? project(data) : null;
    },
  };
}
