import { RULESET } from "../battle/versions/r4.2/content";
import { scaleLootEffect } from "../battle/versions/r4.2/equipment";
import type { LootCopy } from "./types";

/** Display the same duration rounding as combat; percentages are rounded on HP/damage in the engine. */
export function effectValue(copy: LootCopy): number {
  const q = copy.qualityBp / 10000;
  switch (copy.itemId) {
    case "sharp_bookmark": return RULESET.loot.interruptPct * q;
    case "heavy_ink_quill": return RULESET.loot.powerPct * q;
    case "librarian_loupe": return scaleLootEffect(RULESET.loot.vulnerabilityTicks, copy.qualityBp) * RULESET.tickMs / 1000;
    case "last_page_amulet": return RULESET.loot.ultiShieldPct * q;
    case "loan_pendant": return scaleLootEffect(RULESET.loot.cooldownTicks, copy.qualityBp) * RULESET.tickMs / 1000;
    case "streak_medallion": return RULESET.loot.healPct * q;
  }
}
