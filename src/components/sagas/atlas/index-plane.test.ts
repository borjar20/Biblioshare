import { describe, expect, it } from "vitest";
import { indexZoomLevel } from "./index-plane";

describe("indexZoomLevel", () => {
  it.each([
    [0.49, "zones"],
    [0.5, "covers"],
    [1.6, "covers"],
    [1.61, "detail"],
  ])("k=%s → %s", (k, level) => {
    expect(indexZoomLevel(k)).toBe(level);
  });
});
