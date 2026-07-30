import { describe, it, expect } from "vitest";
import { mergeCandidates } from "./mention-search";

describe("mergeCandidates", () => {
  it("pone el grafo primero y rellena con global, dedup por username", () => {
    const graph = [{ username: "borja", displayName: null, avatarUrl: null }];
    const global = [
      { username: "borja", displayName: null, avatarUrl: null },
      { username: "ana", displayName: null, avatarUrl: null },
    ];
    const out = mergeCandidates(graph, global, 6);
    expect(out.map((c) => c.username)).toEqual(["borja", "ana"]);
    expect(out[0].isInGraph).toBe(true);
    expect(out[1].isInGraph).toBe(false);
  });
  it("respeta el límite", () => {
    const global = Array.from({ length: 10 }, (_, i) => ({
      username: `u${i}`, displayName: null, avatarUrl: null,
    }));
    expect(mergeCandidates([], global, 6)).toHaveLength(6);
  });
});
