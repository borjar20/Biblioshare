import { describe, expect, it, vi } from "vitest";
import { createLootService } from "./service";
import type { LootCopy, LootRepository } from "./types";

const copy: LootCopy = { copyId: "00000000-0000-4000-8000-000000000001", itemId: "sharp_bookmark", slot: "weapon", qualityBp: 10000, acquiredAt: "2026-09-08T00:00:00Z" };
function setup() {
  const repo: LootRepository = {
    copies: vi.fn(async () => [copy]),
    selection: vi.fn(async () => ({ weapon: null, amulet: null })),
    equip: vi.fn(async () => ({ weapon: copy.copyId, amulet: null })),
  };
  return { repo, service: createLootService(repo) };
}
describe("loot selection", () => {
  it("rejects malformed requests before writing", async () => {
    const { repo, service } = setup();
    expect(await service.equip("head", copy.copyId)).toEqual({ ok: false, code: "INVALID_SLOT" });
    expect(await service.equip("weapon", { copyId: copy.copyId, qualityBp: 12000 })).toEqual({ ok: false, code: "INVALID_COPY" });
    expect(repo.equip).not.toHaveBeenCalled();
  });
  it("returns the persisted selection and original copy potency", async () => {
    const { repo, service } = setup();
    expect(await service.equip("weapon", copy.copyId)).toEqual({ ok: true, loadout: { weapon: copy, amulet: null } });
    expect(repo.equip).toHaveBeenCalledWith("weapon", copy.copyId);
  });
  it("clears a slot and never projects a missing or wrong-slot copy", async () => {
    const { repo, service } = setup();
    vi.mocked(repo.equip).mockResolvedValue({ weapon: null, amulet: copy.copyId });
    expect(await service.equip("weapon", null)).toEqual({ ok: true, loadout: { weapon: null, amulet: null } });
    vi.mocked(repo.selection).mockResolvedValue({ weapon: "missing", amulet: null });
    expect((await service.state()).loadout).toEqual({ weapon: null, amulet: null });
  });
  it.each(["NOT_OWNED", "WRONG_SLOT"])("preserves SQL authority errors: %s", async code => {
    const { repo, service } = setup();
    vi.mocked(repo.equip).mockRejectedValue({ message: code });
    expect(await service.equip("weapon", copy.copyId)).toEqual({ ok: false, code });
  });
  it("does not expose unexpected database errors", async () => {
    const { repo, service } = setup();
    vi.mocked(repo.equip).mockRejectedValue({ message: "connection details" });
    expect(await service.equip("weapon", copy.copyId)).toEqual({ ok: false, code: "UNAVAILABLE" });
  });
});
