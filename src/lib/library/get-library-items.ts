import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "./position";
import type { LibraryItem, MediaStatus } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type CatalogMeta = {
  title: string;
  coverUrl: string | null;
  subtitle: string | null;
};

export async function getLibraryItems(
  supabase: SupabaseServerClient,
  userId: string,
  filters: { itemType?: ItemType; status?: MediaStatus }
): Promise<LibraryItem[]> {
  let query = supabase
    .from("library_entries")
    .select("id, item_type, item_id, status, rating, position, notes")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (filters.itemType) query = query.eq("item_type", filters.itemType);
  if (filters.status) query = query.eq("status", filters.status);

  const { data: entries, error } = await query;
  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const idsByType: Record<ItemType, string[]> = {
    book: [],
    movie: [],
    series: [],
  };
  for (const entry of entries) {
    idsByType[entry.item_type].push(entry.item_id);
  }

  const catalogByKey = new Map<string, CatalogMeta>();

  const [books, movies, series] = await Promise.all([
    idsByType.book.length
      ? supabase
          .from("books")
          .select("id, title, author, cover_url")
          .in("id", idsByType.book)
      : Promise.resolve({ data: [] }),
    idsByType.movie.length
      ? supabase
          .from("movies")
          .select("id, title, cover_url")
          .in("id", idsByType.movie)
      : Promise.resolve({ data: [] }),
    idsByType.series.length
      ? supabase
          .from("series")
          .select("id, title, cover_url")
          .in("id", idsByType.series)
      : Promise.resolve({ data: [] }),
  ]);

  for (const row of books.data ?? []) {
    catalogByKey.set(`book:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: row.author,
    });
  }
  for (const row of movies.data ?? []) {
    catalogByKey.set(`movie:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
    });
  }
  for (const row of series.data ?? []) {
    catalogByKey.set(`series:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
    });
  }

  return entries
    .map((entry) => {
      const meta = catalogByKey.get(`${entry.item_type}:${entry.item_id}`);
      if (!meta) return null;
      return {
        entryId: entry.id,
        itemType: entry.item_type,
        status: entry.status,
        rating: entry.rating,
        position: parsePosition(entry.item_type, entry.position),
        notes: entry.notes,
        title: meta.title,
        coverUrl: meta.coverUrl,
        subtitle: meta.subtitle,
      } satisfies LibraryItem;
    })
    .filter((item): item is LibraryItem => item !== null);
}
