import { isPetClass, type PetClass, type PetStage } from "./classes";

export type ProfilePet = { name: string; petClass: PetClass; stage: PetStage };
type ProfilePetClient = {
  rpc(name: "get_profile_pet", args: { p_user_id: string }): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Optional, viewer-bound appearance. Never expose the private snapshot. */
export async function getProfilePet(client: ProfilePetClient, userId: string): Promise<ProfilePet | null> {
  try {
    const { data, error } = await client.rpc("get_profile_pet", { p_user_id: userId });
    if (error || !Array.isArray(data) || data.length !== 1) return null;
    const row: unknown = data[0];
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (typeof r.pet_name !== "string" || !r.pet_name.trim() || !isPetClass(r.pet_class)) return null;
    if (r.pet_stage !== "acorn" && r.pet_stage !== "young" && r.pet_stage !== "adult" && r.pet_stage !== "veteran") return null;
    return { name: r.pet_name, petClass: r.pet_class, stage: r.pet_stage };
  } catch {
    return null;
  }
}
