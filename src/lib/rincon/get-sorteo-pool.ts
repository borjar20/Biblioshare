import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { QueueItem } from "@/lib/queue/types";
import type { SorteoItem } from "@/components/rincon/sorteo-logic";
import { fetchCatalogMeta } from "@/lib/queue/fetch-catalog-meta";
import { computeQueueEstimates } from "@/lib/queue/compute-estimates";
import { getBookPace } from "@/lib/queue/get-reading-pace";
import { getMoviePace } from "@/lib/queue/get-movie-cadence";
import { formatDuration } from "@/lib/queue/format-duration";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Español fijo, como formatDuration (ver su nota sobre next-intl).
function metaText(item: QueueItem): string {
  if (item.itemType === "book") return item.totalPages ? `${item.totalPages} pág.` : "Libro";
  if (item.itemType === "movie")
    return item.durationMinutes ? `Película · ${formatDuration(item.durationMinutes)}` : "Película";
  return item.totalEpisodes ? `Serie · ${item.totalEpisodes} episodios` : "Serie";
}

// El pool del sorteo (spec 2026-07-17): TODOS los pendientes del usuario (pase
// activo planned, con o sin cola), cada uno con su estimación transparente
// (§7.22, mismos helpers que «Para más tarde») y el flag `fresh` = sin ningún
// pase anterior con la obra (primera vez).
export async function getSorteoPool(
  supabase: SupabaseServerClient,
  userId: string
): Promise<SorteoItem[]> {
  const { data: entries, error } = await supabase
    .from("passes")
    .select("id, item_type, item_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "planned");
  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const entry of entries) idsByType[entry.item_type].push(entry.item_id);

  const [metaByKey, bookPace, moviePace, previous] = await Promise.all([
    fetchCatalogMeta(supabase, idsByType),
    getBookPace(supabase, userId),
    getMoviePace(supabase, userId),
    // Pases archivados = la obra ya se leyó/vio alguna vez → no es "sin empezar".
    supabase
      .from("passes")
      .select("item_type, item_id")
      .eq("user_id", userId)
      .eq("is_active", false),
  ]);
  if (previous.error) throw previous.error;
  const seen = new Set((previous.data ?? []).map((p) => `${p.item_type}:${p.item_id}`));

  // Ítems sin obra en catálogo se descartan (mismo criterio que getQueueItems).
  const queueItems: QueueItem[] = entries.flatMap((entry) => {
    const meta = metaByKey.get(`${entry.item_type}:${entry.item_id}`);
    if (!meta) return [];
    return [
      {
        entryId: entry.id,
        itemId: entry.item_id,
        itemType: entry.item_type,
        queueId: null,
        queueOrder: 0,
        ...meta,
      } satisfies QueueItem,
    ];
  });

  const estimates = computeQueueEstimates(queueItems, bookPace, moviePace);

  return queueItems.map((item) => {
    const estimate = estimates.perItem[item.entryId];
    const minutes = estimate?.minutes ?? null;
    return {
      itemType: item.itemType,
      itemId: item.itemId,
      title: item.title,
      subtitle: item.subtitle,
      coverUrl: item.coverUrl,
      metaText: metaText(item),
      estimatedMinutes: minutes,
      estimateText: minutes !== null ? estimate.formulaText : null,
      fresh: !seen.has(`${item.itemType}:${item.itemId}`),
    };
  });
}
