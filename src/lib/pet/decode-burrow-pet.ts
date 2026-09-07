import { isPetClass } from "./classes";
import type { BurrowNeighbor } from "./burrow";

/** Explicit projection shared by social reads; private or unknown columns never escape. */
export function decodeBurrowPet(value: unknown): BurrowNeighbor | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.user_id !== "string" || !r.user_id.trim() ||
    typeof r.username !== "string" || !r.username.trim() ||
    !(r.display_name === null || typeof r.display_name === "string") ||
    !(r.avatar_url === null || typeof r.avatar_url === "string") ||
    typeof r.pet_name !== "string" || !r.pet_name.trim() || !isPetClass(r.pet_class) ||
    !(r.pet_stage === "acorn" || r.pet_stage === "young" || r.pet_stage === "adult" || r.pet_stage === "veteran") ||
    typeof r.pet_level !== "number" || !Number.isSafeInteger(r.pet_level) || r.pet_level < 1
  ) return null;
  return {
    userId: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url,
    name: r.pet_name, petClass: r.pet_class, stage: r.pet_stage, level: r.pet_level,
  };
}
