import type { LootSlot } from "./catalog";
import type { LoadoutResponse, LootCopy, LootRepository, LootSelection, PetLoadout } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function projectLoadout(selection: LootSelection, copies: LootCopy[]): PetLoadout {
  const byId = new Map(copies.map(copy => [copy.copyId, copy]));
  const slot = (key: LootSlot) => {
    const copy = byId.get(selection[key] ?? "");
    return copy?.slot === key ? copy : null;
  };
  return { weapon: slot("weapon"), amulet: slot("amulet") };
}

export function createLootService(repo: LootRepository) {
  return {
    async state() {
      const [copies, selection] = await Promise.all([repo.copies(), repo.selection()]);
      return { copies, loadout: projectLoadout(selection, copies) };
    },
    async equip(slot: unknown, copyId: unknown): Promise<LoadoutResponse> {
      if (slot !== "weapon" && slot !== "amulet") return { ok: false, code: "INVALID_SLOT" };
      if (copyId !== null && (typeof copyId !== "string" || !UUID.test(copyId))) return { ok: false, code: "INVALID_COPY" };
      try {
        const selection = await repo.equip(slot, copyId);
        return { ok: true, loadout: projectLoadout(selection, await repo.copies()) };
      } catch (error) {
        const code = typeof error === "object" && error !== null && "message" in error ? error.message : null;
        return { ok: false, code: code === "NOT_OWNED" || code === "WRONG_SLOT" ? code : "UNAVAILABLE" };
      }
    },
  };
}
