import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "./position";
import type { LibraryItem, LibrarySort, MediaStatus } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type CatalogMeta = {
  title: string;
  coverUrl: string | null;
  subtitle: string | null;
  publisher: string | null;
  pageCount: number | null;
  totalEpisodes: number | null;
};

export async function getLibraryItems(
  supabase: SupabaseServerClient,
  userId: string,
  filters: {
    itemType?: ItemType;
    status?: MediaStatus;
    search?: string;
    sort?: LibrarySort;
    favoritesOnly?: boolean;
  }
): Promise<LibraryItem[]> {
  let query = supabase
    .from("library_entries")
    .select("id, item_type, item_id, status, rating, position, notes, pinned_order")
    .eq("user_id", userId);

  if (filters.favoritesOnly) {
    query = query.not("pinned_order", "is", null).order("pinned_order", { ascending: true });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

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
          .select("id, title, author, cover_url, publisher, total_pages")
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
          .select("id, title, cover_url, total_episodes")
          .in("id", idsByType.series)
      : Promise.resolve({ data: [] }),
  ]);

  for (const row of books.data ?? []) {
    catalogByKey.set(`book:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: row.author,
      publisher: row.publisher,
      pageCount: row.total_pages,
      totalEpisodes: null,
    });
  }
  for (const row of movies.data ?? []) {
    catalogByKey.set(`movie:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
      publisher: null,
      pageCount: null,
      totalEpisodes: null,
    });
  }
  for (const row of series.data ?? []) {
    catalogByKey.set(`series:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
      publisher: null,
      pageCount: null,
      totalEpisodes: row.total_episodes,
    });
  }

  // One extra query, batched — cheaper than one count query per entry.
  // See docs/REQUIREMENTS.md §7.13.
  const { data: diaryRows } = await supabase
    .from("diary_entries")
    .select("library_entry_id")
    .in(
      "library_entry_id",
      entries.map((entry) => entry.id)
    )
    // Un pase abierto ("lo estoy leyendo ahora") todavía no es una lectura
    // terminada: no debe sumar a "Leído {count} veces" (colección, perfiles
    // públicos y export CSV comparten este contador).
    .not("finished_on", "is", null);

  const rereadCountByEntry = new Map<string, number>();
  for (const row of diaryRows ?? []) {
    rereadCountByEntry.set(
      row.library_entry_id,
      (rereadCountByEntry.get(row.library_entry_id) ?? 0) + 1
    );
  }

  let items = entries
    .map((entry) => {
      const meta = catalogByKey.get(`${entry.item_type}:${entry.item_id}`);
      if (!meta) return null;
      return {
        entryId: entry.id,
        itemId: entry.item_id,
        itemType: entry.item_type,
        status: entry.status,
        rating: entry.rating,
        position: parsePosition(entry.item_type, entry.position),
        notes: entry.notes,
        title: meta.title,
        coverUrl: meta.coverUrl,
        subtitle: meta.subtitle,
        publisher: meta.publisher,
        pageCount: meta.pageCount,
        totalEpisodes: meta.totalEpisodes,
        rereadCount: rereadCountByEntry.get(entry.id) ?? 0,
        pinnedOrder: entry.pinned_order,
      } satisfies LibraryItem;
    })
    .filter((item): item is LibraryItem => item !== null);

  // Title lives in books/movies/series, not library_entries, so search and
  // title-sort can't happen in the SQL query above — applied here instead,
  // after the two are merged. See docs/REQUIREMENTS.md §7.12.
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    items = items.filter((item) => item.title.toLowerCase().includes(needle));
  }

  if (filters.sort === "rating") {
    items = items.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  } else if (filters.sort === "title") {
    items = items.sort((a, b) => a.title.localeCompare(b.title));
  }
  // "recent" (default) keeps the query's own `updated_at desc` order.

  return items;
}
