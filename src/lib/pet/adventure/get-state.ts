import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { earnCelebration } from "@/lib/celebrations/earn";
import { getPetSnapshot } from "../get-pet-snapshot";
import { buildSnapshot } from "../battle/power";
import { adventureRepository } from "./repository";
import { createAdventureService } from "./service";
import type { AdventureState } from "./types";

type Session = Awaited<ReturnType<typeof createClient>>;

function seed() {
  let value: string;
  do { value = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); } while (value === "0".repeat(32));
  return value;
}

export function adventureServiceFor(session: Session, userId: string) {
  return createAdventureService({
    repository: adventureRepository(createServiceRoleClient(), session, userId),
    seed, newIntent: () => crypto.randomUUID(),
    snapshot: async () => { const pet = await getPetSnapshot(session, userId); return pet ? buildSnapshot(pet) : null; },
    onWin: async (battle) => { await earnCelebration(session, userId, { event: "pet_adventure_won", key: battle.adventure.day }); },
  });
}

export async function getAdventureStateFor(session: Session, userId: string): Promise<AdventureState> {
  return adventureServiceFor(session, userId).state();
}
