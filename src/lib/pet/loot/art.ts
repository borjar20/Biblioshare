import type { LootItemId } from "./catalog";
import assets from "./art-assets.json";
const icon = (id: LootItemId) => `/pet/loot/${id}.png?v=${assets.icons[id].hash}`;
const fx = (id: keyof typeof assets.effects) => `/pet/loot/fx/${id}.png?v=${assets.effects[id].hash}`;
export const LOOT_ART = {
  sharp_bookmark: { icon:icon("sharp_bookmark"),effect:"damage" },
  heavy_ink_quill: { icon:icon("heavy_ink_quill"),effect:"damage" },
  librarian_loupe: { icon:icon("librarian_loupe"),effect:"vulnerability" },
  last_page_amulet: { icon:icon("last_page_amulet"),effect:"shield" },
  loan_pendant: { icon:icon("loan_pendant"),effect:"cooldown" },
  streak_medallion: { icon:icon("streak_medallion"),effect:"heal" },
} as const satisfies Record<LootItemId, {icon:string;effect:string}>;
export const LOOT_FX = {
  damage:fx("damage"),shield:fx("shield"),heal:fx("heal"),cooldown:fx("cooldown"),vulnerability:fx("vulnerability"),
} as const;
export const LOOT_FX_CELL = 64;
export const LOOT_FX_FRAMES = 9;
