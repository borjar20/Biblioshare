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
  /**
   * Recuento por tipo, para la línea «12 libros · 3 películas» de la tarjeta.
   * Ya se calculaba aquí dentro para resolver `dominantType`; ahora además se
   * expone. Solo lleva los tipos PRESENTES: un `0` no se guarda, para que la
   * línea no acabe diciendo «0 series».
   */
  typeCounts: Partial<Record<ItemType, number>>;
  /** Para ordenar en cliente sin volver al servidor (ver collection-browse.ts). */
  updatedAt: string;
  position: number;
  /** Para los atajos rápidos de la tarjeta (renombrar/borrar/sorteo, `CollectionMenu`). */
  description: string | null;
  isSorteable: boolean;
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
    .select("id, name, updated_at, position, description, is_sorteable")
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
    const typeCounts: Partial<Record<ItemType, number>> = {};
    for (const i of own) {
      const type = i.item_type as ItemType;
      typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    }
    const dominantType = (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as ItemType | null;
    return {
      id: c.id,
      name: c.name,
      count: own.length,
      fanCovers: own.slice(0, 3).map((i) => covers.get(`${i.item_type}:${i.item_id}`) ?? null),
      dominantType,
      typeCounts,
      updatedAt: c.updated_at,
      position: c.position,
      description: c.description,
      isSorteable: c.is_sorteable,
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

/**
 * Lo que está en la biblioteca del usuario pero en NINGUNA de sus colecciones —
 * la tira «Sin colección» al pie de la pestaña. Devuelve el total (para el
 * encabezado) y solo las `limit` más recientes hidratadas (para las portadas):
 * la tira enseña un puñado, no la lista entera.
 *
 * Sin colecciones no devuelve nada A PROPÓSITO: para quien no ha creado
 * ninguna, «todo está sin organizar» no es información, es la biblioteca entera
 * repetida debajo de un estado vacío.
 */
export async function getUncollectedItems(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 12,
): Promise<{ items: LibraryItem[]; total: number }> {
  const { data: cols } = await supabase
    .from("collections")
    .select("id")
    .eq("user_id", userId);
  if (!cols || cols.length === 0) return { items: [], total: 0 };

  const { data: rows } = await supabase
    .from("collection_items")
    .select("item_type, item_id")
    .in("collection_id", cols.map((c) => c.id));
  const collected = new Set((rows ?? []).map((r) => `${r.item_type}:${r.item_id}`));

  // La "entrada de biblioteca" es el pase ACTIVO (§Tarea 9, hub), igual que en
  // getLibraryItems: mismo criterio, mismo orden (lo más tocado primero).
  const { data: passes } = await supabase
    .from("passes")
    .select("item_type, item_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  const keys = (passes ?? [])
    .map((p) => ({ item_type: p.item_type as ItemType, item_id: p.item_id }))
    .filter((k) => !collected.has(`${k.item_type}:${k.item_id}`));

  return {
    items: await hydrateItems(supabase, userId, keys.slice(0, limit)),
    total: keys.length,
  };
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
