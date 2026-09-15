import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { groupIdsByType } from "@/lib/catalog/group-ids-by-type";
import { chunkIds } from "@/lib/supabase/in-chunks";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ItemRef = { itemType: ItemType; itemId: string };

// Facetas de catálogo que los criterios de reto necesitan para decidir si un ítem cuenta
// (§7.10). Extraídas de get-challenge-progress.ts para que el reto de club (EPIC-05 Bloque
// H4) las reutilice sin duplicarlas -- ambos motores enriquecen los mismos pases de diario
// con los mismos géneros y sagas.

// Genres live per catalog table (books/movies/series). Fan out one query per
// type that actually has ids — the idsByType pattern shared with the queue.
export async function loadGenres(
  supabase: SupabaseServerClient,
  refs: ItemRef[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const batch of chunkIds(refs)) {
    for (const [key, genres] of await loadGenreBatch(supabase, batch)) result.set(key, genres);
  }
  return result;
}

async function loadGenreBatch(
  supabase: SupabaseServerClient,
  refs: ItemRef[],
): Promise<Map<string, string[]>> {
  const byType = groupIdsByType(refs);
  const map = new Map<string, string[]>();

  const [books, movies, series] = await Promise.all([
    byType.book.length
      ? supabase.from("books").select("id, genres").in("id", byType.book)
      : Promise.resolve({ data: [] }),
    byType.movie.length
      ? supabase.from("movies").select("id, genres").in("id", byType.movie)
      : Promise.resolve({ data: [] }),
    byType.series.length
      ? supabase.from("series").select("id, genres").in("id", byType.series)
      : Promise.resolve({ data: [] }),
  ]);
  for (const result of [books, movies, series]) {
    if ("error" in result && result.error) throw result.error;
  }

  for (const row of books.data ?? []) map.set(`book:${row.id}`, row.genres ?? []);
  for (const row of movies.data ?? []) map.set(`movie:${row.id}`, row.genres ?? []);
  for (const row of series.data ?? []) map.set(`series:${row.id}`, row.genres ?? []);

  return map;
}

// Saga memberships via saga_items (polymorphic item_type+item_id). One item can
// belong to more than one saga, so values accumulate.
export async function loadSagaIds(
  supabase: SupabaseServerClient,
  refs: ItemRef[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (refs.length === 0) return map;

  const itemIds = [...new Set(refs.map((r) => r.itemId))];
  const { data, error } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id")
    .in("item_id", itemIds);

  if (error) throw error;

  for (const row of data ?? []) {
    const key = `${row.item_type}:${row.item_id}`;
    const list = map.get(key) ?? [];
    list.push(row.saga_id);
    map.set(key, list);
  }
  return map;
}
