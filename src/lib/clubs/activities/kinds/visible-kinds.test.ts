import { describe, expect, it } from "vitest";
import { visibleKindOptions } from "./types";

describe("visibleKindOptions", () => {
  it("oculta 'evento' a quien no modera", () => {
    expect(visibleKindOptions(false)).not.toContain("evento");
  });

  it("ofrece 'evento' a moderador+", () => {
    expect(visibleKindOptions(true)).toContain("evento");
  });

  it("los cuatro kinds participativos se ofrecen a todo el mundo", () => {
    const raso = visibleKindOptions(false);
    expect(raso).toEqual([
      "buddy_read",
      "tierlist",
      "list_challenge",
      "criteria_challenge",
    ]);
  });
});
