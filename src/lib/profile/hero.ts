import type { createClient } from "@/lib/supabase/server";
import { hydrateItems } from "@/lib/library/get-library-items";
import { latestPassKeys } from "./latest-passes";
import { coverKey, toProfileCover, type ProfileCover } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const HERO_FAN_MAX = 6;
export const HERO_MOSAIC_SIZE = 21;
export const HERO_MOSAIC_MIN = 3;

export type HeroModel = { fan: ProfileCover[]; mosaic: ProfileCover[] };

// Spec §4.1. Abanico: los destacados (los elige la persona); sin ellos, sus
// últimas terminadas. Mosaico: las últimas terminadas que no están en el
// abanico, repetidas en ciclo hasta llenar la rejilla; con menos de 3
// terminadas no hay mosaico (la cabecera cae a un degradado de acento).
export function pickHero(pinned: ProfileCover[], recent: ProfileCover[]): HeroModel {
  const fan = (pinned.length > 0 ? pinned : recent).slice(0, HERO_FAN_MAX);
  if (recent.length < HERO_MOSAIC_MIN) return { fan, mosaic: [] };
  const inFan = new Set(fan.map(coverKey));
  const rest = recent.filter((c) => !inFan.has(coverKey(c)));
  const source = rest.length > 0 ? rest : recent;
  const mosaic = Array.from({ length: HERO_MOSAIC_SIZE }, (_, i) => source[i % source.length]);
  return { fan, mosaic };
}

export async function getProfileHero(supabase: SupabaseServerClient, userId: string): Promise<HeroModel> {
  const [pinnedKeys, recentKeys] = await Promise.all([
    latestPassKeys(supabase, userId, { pinned: true, limit: HERO_FAN_MAX }),
    latestPassKeys(supabase, userId, { status: "completed", limit: HERO_MOSAIC_SIZE }),
  ]);
  const [pinned, recent] = await Promise.all([
    hydrateItems(supabase, userId, pinnedKeys.map(({ item_type, item_id }) => ({ item_type, item_id }))),
    hydrateItems(supabase, userId, recentKeys.map(({ item_type, item_id }) => ({ item_type, item_id }))),
  ]);
  return pickHero(pinned.map(toProfileCover), recent.map(toProfileCover));
}
