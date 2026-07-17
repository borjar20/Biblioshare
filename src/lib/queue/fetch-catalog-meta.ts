import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { QueueItem } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CatalogMeta = Omit<
  QueueItem,
  "entryId" | "itemId" | "itemType" | "queueId" | "queueOrder"
>;

// Resuelve la ficha de catálogo (título, portada, metadatos de duración) para
// un conjunto de ids por tipo. Compartido por la cola (§7.22) y el sorteo.
export async function fetchCatalogMeta(
  supabase: SupabaseServerClient,
  idsByType: Record<ItemType, string[]>
): Promise<Map<string, CatalogMeta>> {
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
  return metaByKey;
}
