import { isPetClass, type PetStage } from "./classes";
import type { BurrowNeighbor } from "./burrow";

type BurrowClient = {
  rpc(name: "get_burrow_pets"): PromiseLike<{ data: unknown; error: unknown }>;
};
export type BurrowResult =
  | { ok: true; rows: BurrowNeighbor[]; total: number }
  | { ok: false };

function isStage(value: unknown): value is PetStage {
  return value === "acorn" || value === "young" || value === "adult" || value === "veteran";
}

/** Session-bound read. Never cache or pass raw RPC rows to the client. */
export async function getBurrowPets(supabase: BurrowClient): Promise<BurrowResult> {
  try {
    const { data, error } = await supabase.rpc("get_burrow_pets");
    if (error || !Array.isArray(data) || data.length > 60) return { ok: false };
    if (data.length === 0) return { ok: true, rows: [], total: 0 };
    const total: unknown = data[0]?.total;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < data.length) return { ok: false };
    const rows: BurrowNeighbor[] = [];
    for (const value of data as unknown[]) {
      if (!value || typeof value !== "object") continue;
      const r = value as Record<string, unknown>;
      if (r.total !== total) return { ok: false };
      if (
        typeof r.user_id !== "string" || !r.user_id.trim() ||
        typeof r.username !== "string" || !r.username.trim() ||
        !(r.display_name === null || typeof r.display_name === "string") ||
        !(r.avatar_url === null || typeof r.avatar_url === "string") ||
        typeof r.pet_name !== "string" || !r.pet_name.trim() ||
        !isPetClass(r.pet_class) || !isStage(r.pet_stage)
      ) continue;
      rows.push({
        userId: r.user_id, username: r.username, displayName: r.display_name,
        avatarUrl: r.avatar_url, name: r.pet_name, petClass: r.pet_class, stage: r.pet_stage,
      });
    }
    return rows.length ? { ok: true, rows, total } : { ok: false };
  } catch {
    return { ok: false };
  }
}
