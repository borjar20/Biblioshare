import { describe, expect, it } from "vitest";
import { sortFamilies } from "./achievement-grid";
import type { FamilyView } from "@/lib/pet/get-pet-snapshot";

const f = (family: FamilyView["family"], tier: number, value: number, nextThreshold: number | null): FamilyView =>
  ({ family, tier, value, threshold: tier > 0 ? 1 : null, nextThreshold, unlockedAt: null }) as FamilyView;

describe("sortFamilies", () => {
  it("nivel alto primero; empate por cercanía; completas al final", () => {
    const out = sortFamilies([
      f("stage", 2, 40, null),
      f("posts", 1, 60, 100),
      f("notes", 1, 90, 100),
      f("finished", 3, 120, 200),
    ]).map((x) => x.family);
    expect(out).toEqual(["finished", "notes", "posts", "stage"]);
  });
});
