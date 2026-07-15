import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "./position";
import { keepLatestClosedPass } from "@/lib/community/latest-rating";
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
  // "Entrada de biblioteca" = pase ACTIVO de la obra (§Tarea 9, hub):
  // item_type/item_id/status/position/pinned_order viven directamente en
  // diary_entries, library_entries ya no se lee. rating/notes tampoco se leen
  // de aquí: quedaron huérfanas cuando el pase se convirtió en el dueño de la
  // nota y la reseña (20260714_passes.sql). Se recalculan más abajo a partir
  // del último pase cerrado de cada obra.
  let query = supabase
    .from("diary_entries")
    .select("id, item_type, item_id, status, position, pinned_order")
    .eq("user_id", userId)
    .eq("is_active", true);

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

  // Todos los pases (de cualquier obra en esta página, abiertos y cerrados)
  // de este usuario, batched — cheaper than one query per entry. See
  // docs/REQUIREMENTS.md §7.13. item_type/item_id ya son columnas propias del
  // pase (§Tarea 9): se filtra por item_id directamente, sin el join a
  // library_entries que resolvía antes esa relación, y se agrupa abajo por
  // `${item_type}:${item_id}` en vez de por id de entrada (que ya no existe).
  // `rating` sale de diary_entries directamente: la RLS de la tabla ya decide
  // qué filas se ven (perfil propio o público visible) y esa columna es
  // legible siempre, cuente o no la reseña como pública — la nota nunca fue
  // lo que is_public escondía.
  const allItemIds = entries.map((entry) => entry.item_id);
  const { data: closedPassRows } = await supabase
    .from("diary_entries")
    .select("id, item_type, item_id, finished_on, rating")
    .eq("user_id", userId)
    .in("item_id", allItemIds)
    // Un pase abierto ("lo estoy leyendo ahora") todavía no es una lectura
    // terminada: no debe sumar a "Leído {count} veces" (colección, perfiles
    // públicos y export CSV comparten este contador) ni aportar nota/reseña.
    .not("finished_on", "is", null);

  const rereadCountByItem = new Map<string, number>();
  for (const row of closedPassRows ?? []) {
    const key = `${row.item_type}:${row.item_id}`;
    rereadCountByItem.set(key, (rereadCountByItem.get(key) ?? 0) + 1);
  }

  // Nota (estrellas) y "notas" (texto) visibles de cada obra: las del último
  // pase cerrado, mismo criterio de desempate que la media de comunidad
  // (latest-rating.ts), agrupado aquí por obra en vez de por usuario porque
  // toda esta colección es de un único usuario.
  const latestClosedPasses = keepLatestClosedPass(
    (closedPassRows ?? []).map((r) => ({
      id: r.id,
      itemKey: `${r.item_type}:${r.item_id}`,
      finishedOn: r.finished_on as string,
      rating: r.rating,
    }))
  );
  const ratingByItem = new Map(
    latestClosedPasses.map((p) => [p.itemKey, p.rating])
  );

  // El texto de la reseña ("notas") vive en pass_reviews: es la única vía de
  // lectura del texto (diary_entries.review ya no es una columna legible
  // desde el cliente), y de paso trae la privacidad ya aplicada — si el pase
  // ganador es una reseña privada de OTRO usuario, esta consulta simplemente
  // no devuelve esa fila y el texto se muestra en blanco, no un error.
  const latestPassIds = latestClosedPasses.map((p) => p.id);
  const { data: reviewRows } = latestPassIds.length
    ? await supabase.from("pass_reviews").select("id, review").in("id", latestPassIds)
    : { data: [] as { id: string | null; review: string | null }[] };
  const reviewByPassId = new Map((reviewRows ?? []).map((r) => [r.id, r.review]));
  const notesByItem = new Map(
    latestClosedPasses.map((p) => [p.itemKey, reviewByPassId.get(p.id) ?? null])
  );

  let items = entries
    .map((entry): LibraryItem | null => {
      const itemKey = `${entry.item_type}:${entry.item_id}`;
      const meta = catalogByKey.get(itemKey);
      if (!meta) return null;
      return {
        // entryId/activePassId son ahora el MISMO id: el pase activo es la
        // entrada de biblioteca (§Tarea 9, hub). Se conservan ambos campos en
        // LibraryItem porque la UI ya los consume por separado (favoritos vs.
        // "/sesion/"), pero ya no hace falta una segunda query para resolver
        // el activo — esta fila YA es el pase activo.
        entryId: entry.id,
        itemId: entry.item_id,
        itemType: entry.item_type,
        status: entry.status,
        rating: ratingByItem.get(itemKey) ?? null,
        position: parsePosition(entry.item_type, entry.position),
        notes: notesByItem.get(itemKey) ?? null,
        title: meta.title,
        coverUrl: meta.coverUrl,
        subtitle: meta.subtitle,
        publisher: meta.publisher,
        pageCount: meta.pageCount,
        totalEpisodes: meta.totalEpisodes,
        rereadCount: rereadCountByItem.get(itemKey) ?? 0,
        pinnedOrder: entry.pinned_order,
        activePassId: entry.id,
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
