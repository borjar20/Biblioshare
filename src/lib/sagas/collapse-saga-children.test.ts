import { describe, expect, it } from "vitest";
import { collapseSagaChildren } from "./collapse-saga-children";

describe("collapseSagaChildren", () => {
  it("con menos o igual que max, todo visible y sin resto", () => {
    expect(collapseSagaChildren([1, 2], 2)).toEqual({ visible: [1, 2], hiddenCount: 0 });
    expect(collapseSagaChildren([1], 2)).toEqual({ visible: [1], hiddenCount: 0 });
    expect(collapseSagaChildren([], 2)).toEqual({ visible: [], hiddenCount: 0 });
  });

  it("con más que max, corta y cuenta el resto", () => {
    expect(collapseSagaChildren([1, 2, 3, 4, 5, 6], 2)).toEqual({ visible: [1, 2], hiddenCount: 4 });
  });
});
