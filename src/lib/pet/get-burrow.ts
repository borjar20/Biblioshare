import { decodeBurrowPet } from "./decode-burrow-pet";
import type { BurrowNeighbor } from "./burrow";

type BurrowClient = {
  rpc(name: "get_burrow_pets_with_level"): PromiseLike<{ data: unknown; error: unknown }>;
};
export type BurrowResult =
  | { ok: true; rows: BurrowNeighbor[]; total: number }
  | { ok: false };

/** Session-bound read. Never cache or pass raw RPC rows to the client. */
export async function getBurrowPets(supabase: BurrowClient): Promise<BurrowResult> {
  try {
    const { data, error } = await supabase.rpc("get_burrow_pets_with_level");
    if (error || !Array.isArray(data) || data.length > 60) return { ok: false };
    if (data.length === 0) return { ok: true, rows: [], total: 0 };
    const total: unknown = data[0]?.total;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < data.length) return { ok: false };
    const rows: BurrowNeighbor[] = [];
    for (const value of data as unknown[]) {
      if (!value || typeof value !== "object") continue;
      const r = value as Record<string, unknown>;
      if (r.total !== total) return { ok: false };
      const pet = decodeBurrowPet(r);
      if (pet) rows.push(pet);
    }
    return rows.length ? { ok: true, rows, total } : { ok: false };
  } catch {
    return { ok: false };
  }
}
