import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";
import { pagesForPass } from "@/lib/editions/edition-label";
import type { EstimableItem } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CatalogMeta = Omit<
  EstimableItem,
  "entryId" | "itemId" | "itemType" | "queueId" | "queueOrder"
>;

type EditionRow = { id: string; total_pages: number | null };

// Las páginas son un dato de la TIRADA, no de la obra: la búsqueda ya no
// escribe `books.total_pages` (ver el comentario de local-search.ts), así que
// para casi todo lo que entra hoy vive solo en `book_editions`. Mirar únicamente
// la obra dejaba libros con páginas conocidas como "sin estimar", fuera de todos
// los tramos del filtro de duración del sorteo.
//
// MISMA precedencia que el resto de la app (`pagesForPass`, spec 2026-08-26 §5):
// edición identificada en el pase → páginas orientativas de la obra. Aquí se
// trabaja con FILAS crudas de `book_editions` (lotes de varios libros en una
// consulta), no con el tipo `Edition`, así que la búsqueda por id vive aquí y
// la regla se delega.
//
// Hasta esta tarea había DOS peldaños extra: la «edición primaria» y, después,
// «cualquier edición con páginas». El segundo era deliberado —el sorteo solo
// alimenta los tramos ‹2 h / 2–5 h / +5 h, donde "sin estimar" es peor que una
// tirada aproximada— pero convertía a esta función en el ÚNICO consumidor con
// una precedencia propia: el mismo libro salía con 736 páginas en el sorteo y
// con 684 en la barra de progreso, sin que nada avisara. Se prefiere un número
// coherente en toda la app a uno más optimista solo aquí.
export function pickEditionPages(
  editions: EditionRow[],
  passEditionId: string | null | undefined,
  workTotalPages: number | null | undefined
): number | null {
  const passEdition = editions.find((e) => e.id === passEditionId) ?? null;
  return pagesForPass(
    passEdition && { totalUnits: passEdition.total_pages },
    workTotalPages
  );
}

// Resuelve la ficha de catálogo (título, portada, metadatos de duración) para
// un conjunto de ids por tipo. Compartido por la cola (§7.22) y el sorteo.
export async function fetchCatalogMeta(
  supabase: SupabaseServerClient,
  idsByType: Record<ItemType, string[]>,
  // Edición identificada en el pase, por clave `tipo:id`. Sin ella manda
  // `books.total_pages`.
  editionIdByItem: Map<string, string | null> = new Map()
): Promise<Map<string, CatalogMeta>> {
  const [books, movies, series, editions] = await Promise.all([
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
    idsByType.book.length
      ? supabase
          .from("book_editions")
          .select("id, book_id, total_pages")
          .in("book_id", idsByType.book)
      : Promise.resolve({ data: [] }),
  ]);

  const editionsByBook = new Map<string, EditionRow[]>();
  for (const row of editions.data ?? []) {
    const list = editionsByBook.get(row.book_id);
    if (list) list.push(row);
    else editionsByBook.set(row.book_id, [row]);
  }

  const metaByKey = new Map<string, CatalogMeta>();
  for (const row of books.data ?? []) {
    metaByKey.set(`book:${row.id}`, {
      title: row.title ?? UNTITLED_FALLBACK,
      coverUrl: row.cover_url,
      subtitle: row.author,
      totalPages: pickEditionPages(
        editionsByBook.get(row.id) ?? [],
        editionIdByItem.get(`book:${row.id}`),
        row.total_pages
      ),
      durationMinutes: null,
      totalEpisodes: null,
      episodeRuntimeMinutes: null,
      tmdbId: null,
    });
  }
  for (const row of movies.data ?? []) {
    metaByKey.set(`movie:${row.id}`, {
      title: row.title ?? UNTITLED_FALLBACK,
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
      title: row.title ?? UNTITLED_FALLBACK,
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
