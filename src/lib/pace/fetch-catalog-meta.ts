import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";
import type { EstimableItem } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CatalogMeta = Omit<
  EstimableItem,
  "entryId" | "itemId" | "itemType" | "queueId" | "queueOrder"
>;

type EditionRow = { id: string; total_pages: number | null; is_primary: boolean };

// Las páginas son un dato de la TIRADA, no de la obra: la búsqueda ya no
// escribe `books.total_pages` (ver el comentario de local-search.ts), así que
// para casi todo lo que entra hoy vive solo en `book_editions`. Mirar únicamente
// la obra dejaba libros con páginas conocidas como "sin estimar", fuera de todos
// los tramos del filtro de duración del sorteo.
//
// Mismo orden de precedencia que el registro de sesión (load-context.ts):
// edición del pase → edición primaria → la obra. Bolsillo y tapa dura no tienen
// las mismas páginas, y la que manda es la que el usuario dijo que está leyendo.
//
// Con un último recurso que load-context NO tiene, y a propósito: si ni el pase
// ni la primaria traen páginas, vale cualquier edición que las tenga. Allí el
// total valida el progreso (pasarse de página es un error) y conviene ser
// estricto; aquí solo alimenta los tramos ‹2 h / 2–5 h / +5 h, donde la
// diferencia entre dos tiradas del mismo libro es ruido y "sin estimar" es peor.
export function pickEditionPages(
  editions: EditionRow[],
  passEditionId: string | null | undefined
): number | null {
  const chosen =
    editions.find((e) => e.id === passEditionId && e.total_pages !== null) ??
    editions.find((e) => e.is_primary && e.total_pages !== null) ??
    editions.find((e) => e.total_pages !== null);
  return chosen?.total_pages ?? null;
}

// Resuelve la ficha de catálogo (título, portada, metadatos de duración) para
// un conjunto de ids por tipo. Compartido por la cola (§7.22) y el sorteo.
export async function fetchCatalogMeta(
  supabase: SupabaseServerClient,
  idsByType: Record<ItemType, string[]>,
  // Edición elegida en el pase, por clave `tipo:id`. Sin ella se usa la primaria.
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
          .select("id, book_id, total_pages, is_primary")
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
    const editionPages = pickEditionPages(
      editionsByBook.get(row.id) ?? [],
      editionIdByItem.get(`book:${row.id}`)
    );
    metaByKey.set(`book:${row.id}`, {
      title: row.title ?? UNTITLED_FALLBACK,
      coverUrl: row.cover_url,
      subtitle: row.author,
      totalPages: editionPages ?? row.total_pages,
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
