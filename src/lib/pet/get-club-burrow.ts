import { decodeBurrowPet } from "./decode-burrow-pet";
import type { BurrowNeighbor } from "./burrow";

type Client = { rpc(name: "get_club_burrow_pets", args: { p_club_id: string }): PromiseLike<{ data: unknown; error: unknown }> };
export type ClubBurrowResult =
  | { ok: true; own: BurrowNeighbor | null; neighbors: BurrowNeighbor[]; total: number }
  | { ok: false };

/** A single session-bound read includes the own pet; membership gates every row. */
export async function getClubBurrowPets(client: Client, clubId: string, viewerId: string): Promise<ClubBurrowResult> {
  try {
    const { data, error } = await client.rpc("get_club_burrow_pets", { p_club_id: clubId });
    if (error || !Array.isArray(data) || data.length > 61) return { ok: false };
    const ownRows = data.filter((r) => r?.user_id === viewerId);
    const neighborRows = data.filter((r) => r?.user_id !== viewerId);
    if (ownRows.length > 1 || new Set(data.map((r) => r?.user_id)).size !== data.length) return { ok: false };
    const total: unknown = data[0]?.total ?? 0;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < neighborRows.length || data.some((r) => r?.total !== total)) return { ok: false };
    if (neighborRows.length > 60 || (neighborRows.length === 0 && total !== 0)) return { ok: false };
    const rows: BurrowNeighbor[] = [];
    for (const value of data) {
      const pet = decodeBurrowPet(value);
      if (!pet) return { ok: false };
      rows.push(pet);
    }
    return { ok: true, own: rows.find((r) => r.userId === viewerId) ?? null,
      neighbors: rows.filter((r) => r.userId !== viewerId), total };
  } catch { return { ok: false }; }
}
