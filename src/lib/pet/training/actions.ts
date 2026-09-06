"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getPetSnapshot } from "../get-pet-snapshot";
import { buildSnapshot } from "../battle/power";
import { createTrainingService } from "./service";
import { trainingRepository } from "./repository";
import type { TrainingResponse } from "./types";

function seed() {
  let value: string;
  do {
    value = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  } while (value === "0".repeat(32));
  return value;
}

async function execute(
  operation: (service: ReturnType<typeof createTrainingService>) => Promise<TrainingResponse>,
): Promise<TrainingResponse> {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return { ok: false, code: "UNAUTHENTICATED" };
    const service = createTrainingService({
      repository: trainingRepository(createServiceRoleClient(), user.id), seed,
      snapshot: async () => {
        const pet = await getPetSnapshot(client, user.id);
        return pet ? buildSnapshot(pet) : null;
      },
    });
    return await operation(service);
  } catch (error) {
    console.error("pet training", error);
    return { ok: false, code: "UNAVAILABLE" };
  }
}

export async function startBattle(intentId: string, enemyId = "brote"): Promise<TrainingResponse> {
  return execute(service => service.start(intentId, enemyId));
}

export async function resolveBattle(intentId: string, inputs: unknown): Promise<TrainingResponse> {
  return execute(service => service.resolve(intentId, inputs));
}

export async function replayTrainingBattle(intentId: string): Promise<TrainingResponse> {
  return execute(service => service.replay(intentId));
}
