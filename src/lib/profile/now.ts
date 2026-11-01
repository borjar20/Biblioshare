import type { createClient } from "@/lib/supabase/server";
import { hydrateItems } from "@/lib/library/get-library-items";
import type { LibraryItem } from "@/lib/library/types";
import { deriveWorkProgress } from "@/lib/people/work-progress";
import { latestPassKeys, type PassKey } from "./latest-passes";
import { coverKey, toProfileCover, type ProfileCover } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const NOW_MAX = 3;
export type NowItem = ProfileCover & { progressLabel: string | null; progressPercent: number | null };

// El avance sale de la posición CRUDA del pase (la que interpreta
// `deriveWorkProgress`, el mismo criterio que la ficha de persona), no de la ya
// parseada de `LibraryItem`. El total de páginas, de la edición del pase.
export function toNowItems(keys: PassKey[], items: LibraryItem[]): NowItem[] {
  const byKey = new Map(items.map((i) => [coverKey(i), i]));
  return keys.flatMap((k) => {
    const item = byKey.get(`${k.item_type}:${k.item_id}`);
    if (!item) return [];
    const p = deriveWorkProgress(item.itemType, "in_progress", k.position, item.pageCount);
    return [{ ...toProfileCover(item), progressLabel: p.label, progressPercent: p.percent }];
  });
}

export async function getProfileNow(supabase: SupabaseServerClient, userId: string): Promise<NowItem[]> {
  const keys = await latestPassKeys(supabase, userId, { status: "in_progress", limit: NOW_MAX });
  if (keys.length === 0) return [];
  const items = await hydrateItems(supabase, userId, keys.map(({ item_type, item_id }) => ({ item_type, item_id })));
  return toNowItems(keys, items);
}
