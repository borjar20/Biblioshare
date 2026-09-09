"use server";

import { createClient } from "@/lib/supabase/server";
import { adventureServiceFor } from "./get-state";
import type { AdventureResponse } from "./types";

async function withService<T>(operation: (service: ReturnType<typeof adventureServiceFor>) => Promise<T>, fallback: T): Promise<T> {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return fallback;
    return await operation(adventureServiceFor(client, user.id));
  } catch (error) {
    console.error("pet adventure", error);
    return fallback;
  }
}

export async function startAdventure(): Promise<AdventureResponse> {
  return withService((s) => s.start(), { ok: false, code: "UNAVAILABLE" });
}
export async function resumeAdventure(intentId: string): Promise<AdventureResponse> {
  return withService((s) => s.resume(intentId), { ok: false, code: "UNAVAILABLE" });
}
export async function resolveAdventure(intentId: string, inputs: unknown): Promise<AdventureResponse> {
  return withService((s) => s.resolve(intentId, inputs), { ok: false, code: "UNAVAILABLE" });
}
export async function replayAdventure(intentId: string): Promise<AdventureResponse> {
  return withService((s) => s.replay(intentId), { ok: false, code: "UNAVAILABLE" });
}
