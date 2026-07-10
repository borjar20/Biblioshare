import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { QueueItem } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type CatalogMeta = Omit<
  QueueItem,
  "entryId" | "itemId" | "itemType" | "queueId" | "queueOrder"
>;

// Assumes ensureQueueOrder(supabase, userId) already ran this request — a
// dense, gap-free queue_order per "planned" item, within each queue. Pass a
// queueId to fetch one named queue, or null for the "Sin cola" bucket
// (planned items with no queue). See docs/REQUIREMENTS.md §7.22.
export async function getQueueItems(
  supabase: SupabaseServerClient,
  userId: string,
  queueId: string | null
): Promise<QueueItem[]> {
  let query = supabase
    .from("library_entries")
    .select("id, item_type, item_id, queue_id, queue_order")
    .eq("user_id", userId)
    .eq("status", "planned");

  // Postgres treats `= NULL` as never-true, so the empty bucket needs `is`.
  query = queueId === null ? query.is("queue_id", null) : query.eq("queue_id", queueId);

  const { data: entries, error } = await query.order("queue_order", { ascending: true });

  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const entry of entries) idsByType[entry.item_type].push(entry.item_id);

  const [books, movies, series] = await Promise.all([
    idsByType.book.length
      ? supabase.from("books").select("id, title, author, cover_url, total_pages").in("id", idsByType.book)
      : Promise.resolve({ data: [] }),
    idsByType.movie.length
      ? supabase
          .from("movies")
          .select("id, title, cover_url, duration_minutes, tmdb_id")
          .in("id", idsByType.movie)
      : Promise.resolve({ data: [] }),
    idsByType.series.length
      ? supabase
          .from("series")
          .select("id, title, cover_url, total_episodes, episode_runtime_minutes, tmdb_id")
          .in("id", idsByType.series)
      : Promise.resolve({ data: [] }),
  ]);

  const metaByKey = new Map<string, CatalogMeta>();
  for (const row of books.data ?? []) {
    metaByKey.set(`book:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: row.author,
      totalPages: row.total_pages,
      durationMinutes: null,
      totalEpisodes: null,
      episodeRuntimeMinutes: null,
      tmdbId: null,
    });
  }
  for (const row of movies.data ?? []) {
    metaByKey.set(`movie:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
      totalPages: null,
      durationMinutes: row.duration_minutes,
      totalEpisodes: null,
      episodeRuntimeMinutes: null,
      tmdbId: row.tmdb_id,
    });
  }
  for (const row of series.data ?? []) {
    metaByKey.set(`series:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
      totalPages: null,
      durationMinutes: null,
      totalEpisodes: row.total_episodes,
      episodeRuntimeMinutes: row.episode_runtime_minutes,
      tmdbId: row.tmdb_id,
    });
  }

  return entries
    .map((entry) => {
      const meta = metaByKey.get(`${entry.item_type}:${entry.item_id}`);
      if (!meta) return null;
      return {
        entryId: entry.id,
        itemId: entry.item_id,
        itemType: entry.item_type,
        queueId: entry.queue_id,
        queueOrder: entry.queue_order ?? 0,
        ...meta,
      } satisfies QueueItem;
    })
    .filter((item): item is QueueItem => item !== null);
}
