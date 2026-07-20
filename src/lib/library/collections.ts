// Módulo server-only de LECTURA (lo consumen server components como
// `get-library-items.ts`). Sin `"use server"`: no son server actions.
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { LibraryItem } from "./types";
import { hydrateItems } from "./get-library-items";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CollectionSort = "recent" | "name" | "size";
export type CollectionCard = {
  id: string;
  name: string;
  count: number;
  fanCovers: (string | null)[]; // hasta 3, más reciente primero
  dominantType: ItemType | null;
};

// Portada por (item_type, item_id) reutilizando el patrón de get-library-items.
async function coversFor(
  supabase: SupabaseServerClient,
  keys: { item_type: ItemType; item_id: string }[],
): Promise<Map<string, string | null>> {
  const byType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const k of keys) byType[k.item_type].push(k.item_id);
  const out = new Map<string, string | null>();
  const [books, movies, series] = await Promise.all([
    byType.book.length ? supabase.from("books").select("id, cover_url").in("id", byType.book) : Promise.resolve({ data: [] }),
    byType.movie.length ? supabase.from("movies").select("id, cover_url").in("id", byType.movie) : Promise.resolve({ data: [] }),
    byType.series.length ? supabase.from("series").select("id, cover_url").in("id", byType.series) : Promise.resolve({ data: [] }),
  ]);
  for (const r of books.data ?? []) out.set(`book:${r.id}`, r.cover_url);
  for (const r of movies.data ?? []) out.set(`movie:${r.id}`, r.cover_url);
  for (const r of series.data ?? []) out.set(`series:${r.id}`, r.cover_url);
  return out;
}

export async function listCollections(
  supabase: SupabaseServerClient,
  userId: string,
  sort: CollectionSort = "recent",
): Promise<CollectionCard[]> {
  const { data: cols, error } = await supabase
    .from("collections")
    .select("id, name, updated_at, position")
    .eq("user_id", userId);
  if (error) throw error;
  if (!cols || cols.length === 0) return [];

  // Ítems de todas las colecciones, para recuento + 3 portadas por colección.
  const { data: items } = await supabase
    .from("collection_items")
    .select("collection_id, item_type, item_id, added_at, position")
    .in("collection_id", cols.map((c) => c.id));

  const covers = await coversFor(
    supabase,
    (items ?? []).map((i) => ({ item_type: i.item_type as ItemType, item_id: i.item_id })),
  );

  const cards: CollectionCard[] = cols.map((c) => {
    const own = (items ?? [])
      .filter((i) => i.collection_id === c.id)
      .sort((a, b) => (a.position - b.position) || b.added_at.localeCompare(a.added_at));
    const typeCounts: Record<string, number> = {};
    for (const i of own) typeCounts[i.item_type] = (typeCounts[i.item_type] ?? 0) + 1;
    const dominantType = (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as ItemType | null;
    return {
      id: c.id,
      name: c.name,
      count: own.length,
      fanCovers: own.slice(0, 3).map((i) => covers.get(`${i.item_type}:${i.item_id}`) ?? null),
      dominantType,
    };
  });

  if (sort === "name") cards.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "size") cards.sort((a, b) => b.count - a.count);
  else cards.sort((a, b) => {
    const ca = cols.find((c) => c.id === a.id)!;
    const cb = cols.find((c) => c.id === b.id)!;
    return (ca.position - cb.position) || cb.updated_at.localeCompare(ca.updated_at);
  });
  return cards;
}

// Colecciones (del dueño) que YA contienen este ítem — para premarcar los
// checkboxes de la hoja «Añadir a colección» (frame D, Task 3 S2). Filtra por
// `item_type`/`item_id` y comprueba el `user_id` de la colección embebida:
// la RLS de `collection_items` ya restringe a las colecciones propias, esto
// es la "doble red" del mismo criterio que `getCollection` usa arriba.
export async function getCollectionsForItem(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("collection_items")
    .select("collection_id, collections!inner(user_id)")
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter((r) => r.collections?.user_id === userId)
      .map((r) => r.collection_id),
  );
}

export type CollectionDetail = {
  id: string;
  name: string;
  description: string | null;
  items: LibraryItem[];
  avgRating: number | null;
  isSorteable: boolean;
};

export async function getCollection(
  supabase: SupabaseServerClient,
  userId: string,
  id: string,
): Promise<CollectionDetail | null> {
  const { data: col } = await supabase
    .from("collections")
    .select("id, name, description, user_id, is_sorteable")
    .eq("id", id)
    .maybeSingle();
  if (!col || col.user_id !== userId) return null; // RLS ya lo gatea; doble red.

  const { data: rows } = await supabase
    .from("collection_items")
    .select("item_type, item_id, position, added_at")
    .eq("collection_id", id)
    .order("position", { ascending: true })
    .order("added_at", { ascending: false });

  // Hidratar cada (tipo,id) a LibraryItem reutilizando la lógica de biblioteca:
  // catálogo (título/portada/subtítulo/páginas) + estado del pase activo + nota
  // del último pase cerrado. Para no duplicar get-library-items, se reutiliza el
  // helper `hydrateItems(supabase, userId, keys)` extraído allí.
  const items = await hydrateItems(
    supabase,
    userId,
    (rows ?? []).map((r) => ({ item_type: r.item_type as ItemType, item_id: r.item_id })),
  );
  const ratings = items.map((i) => i.rating).filter((r): r is number => r !== null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  return {
    id: col.id,
    name: col.name,
    description: col.description,
    items,
    avgRating,
    isSorteable: col.is_sorteable,
  };
}
