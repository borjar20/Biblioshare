import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_FAMILIES } from "./achievements";
import { BADGE_MANIFEST } from "./badges";

describe("manifiesto de insignias", () => {
  it("cada familia de logros tiene su PNG en public/", () => {
    for (const f of ACHIEVEMENT_FAMILIES) {
      const src = BADGE_MANIFEST[f];
      expect(src, f).toMatch(/^\/pet\/badges\/[a-z]+\.png$/);
      expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
    }
  });
});
