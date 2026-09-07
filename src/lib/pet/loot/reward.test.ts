import { describe, expect, it } from "vitest";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import { LOOT_ITEMS, isReward } from "./catalog";
import { inventoryFrom, pickReward, rewardOrder } from "./reward";

describe("botín R4a (spec §7)", () => {
  it("el catálogo tiene seis ids únicos, tres por ranura", () => {
    expect(LOOT_ITEMS).toHaveLength(6);
    expect(new Set(LOOT_ITEMS.map((i) => i.id)).size).toBe(6);
    expect(LOOT_ITEMS.filter((i) => i.slot === "weapon")).toHaveLength(3);
    expect(LOOT_ITEMS.filter((i) => i.slot === "amulet")).toHaveLength(3);
  });
  it("rewardOrder es una permutación determinista del catálogo", () => {
    const a = rewardOrder(seedFromIndex(1));
    expect(a).toEqual(rewardOrder(seedFromIndex(1)));
    expect([...a].map((r) => r.itemId).sort()).toEqual(LOOT_ITEMS.map((i) => i.id).sort());
    expect(rewardOrder(seedFromIndex(2))).not.toEqual(a);
    expect(a.every(isReward)).toBe(true);
  });
  it("pickReward prefiere el primer no poseído y cae al primero cuando se posee todo", () => {
    const order = rewardOrder(seedFromIndex(3));
    expect(pickReward(order, [])).toEqual(order[0]);
    expect(pickReward(order, [order[0].itemId])).toEqual(order[1]);
    expect(pickReward(order, order.map((r) => r.itemId))).toEqual(order[0]);
  });
  it("el primer no poseído de una permutación uniforme es uniforme entre los no poseídos", () => {
    const owned = ["sharp_bookmark", "last_page_amulet"];
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) { const r = pickReward(rewardOrder(seedFromIndex(i)), owned); counts.set(r.itemId, (counts.get(r.itemId) ?? 0) + 1); }
    expect([...counts.keys()].sort()).toEqual(["heavy_ink_quill", "librarian_loupe", "loan_pendant", "streak_medallion"]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(400); // 2000/4 = 500 ± margen
  });
  it("inventoryFrom agrupa con recuento en orden de catálogo e ignora nulos", () => {
    const [w1, , , a1] = LOOT_ITEMS;
    expect(inventoryFrom([{ itemId: a1.id, slot: a1.slot }, null, { itemId: w1.id, slot: w1.slot }, { itemId: a1.id, slot: a1.slot }])).toEqual([
      { itemId: w1.id, slot: w1.slot, count: 1 }, { itemId: a1.id, slot: a1.slot, count: 2 },
    ]);
  });
});
