import { describe, expect, it } from "vitest";
import { copyFromWin, isQualityBp } from "./copies";
import { isReward } from "./catalog";

const oldReward = { itemId: "sharp_bookmark", slot: "weapon" };
const row = { id: "a5b2cb6b-9a74-4dfe-b942-ce82057b1568", resolved_at: "2026-09-07T12:00:00Z", reward: oldReward };

describe("immutable loot copies", () => {
  it("projects historical wins at neutral quality without rewriting their reward", () => {
    const reward = Object.freeze({ ...oldReward });
    expect(copyFromWin({ ...row, reward })).toEqual({ copyId: row.id, acquiredAt: row.resolved_at,
      itemId: "sharp_bookmark", slot: "weapon", qualityBp: 10000 });
    expect(reward).toEqual(oldReward);
  });
  it("keeps the quality and identity of each copy of the same item", () => {
    const a = copyFromWin({ ...row, reward: { ...oldReward, qualityBp: 8000, qualityVersion: 1 } });
    const b = copyFromWin({ ...row, id: "c323979f-3b12-4d53-999a-471b319f076e", reward: { ...oldReward, qualityBp: 12000, qualityVersion: 1 } });
    expect(a?.qualityBp).toBe(8000);
    expect(b?.qualityBp).toBe(12000);
    expect(a?.copyId).not.toBe(b?.copyId);
  });
  it.each([7999, 9999, 12001, NaN, Infinity, "10000", null, undefined])("rejects quality %s", value => {
    expect(isQualityBp(value)).toBe(false);
    expect(isReward({ ...oldReward, qualityVersion: 1, qualityBp: value })).toBe(false);
  });
  it.each([
    { ...oldReward, qualityBp: 10000 }, { ...oldReward, qualityVersion: 1 },
    { ...oldReward, qualityBp: 10000, qualityVersion: 2 },
    { ...oldReward, slot: "amulet" }, { ...oldReward, itemId: "invented" },
  ])("rejects incomplete, unknown and wrong-slot rewards", reward => {
    expect(copyFromWin({ ...row, reward })).toBeNull();
    expect(isReward(reward)).toBe(false);
  });
  it("does not invent a copy from a missing reward or unresolved row", () => {
    expect(copyFromWin({ ...row, reward: null })).toBeNull();
    expect(copyFromWin({ ...row, resolved_at: null })).toBeNull();
  });
});
