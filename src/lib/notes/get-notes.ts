import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "@/lib/library/position";
import type { Note, NoteCounts } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type Row = {
  id: string;
  item_type: ItemType;
  item_id: string;
  kind: "note" | "quote";
  body: string;
  position: unknown;
  is_favorite: boolean;
  meta: unknown;
  is_spoiler: boolean;
  is_public: boolean;
  created_at: string;
};

// meta es jsonb opaco: lo que la BD garantiza es que es un objeto, no que
// tenga tags ni que sean strings. Se valida aquí, en el borde de lectura.
function tagsOf(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const raw = (meta as Record<string, unknown>).tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string");
}

// Las notas del usuario, más nuevas primero, con el título de la obra resuelto
// del catálogo (mismo patrón batch que get-library-items). RLS las acota al
// dueño. Privadas — nunca se sirven a un visitante.
export async function getNotes(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, item_type, item_id, kind, body, position, is_favorite, meta, is_spoiler, is_public, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const idsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const r of rows) idsByType[r.item_type].add(r.item_id);

  const [books, movies, series] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, title").in("id", [...idsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    idsByType.movie.size
      ? supabase.from("movies").select("id, title").in("id", [...idsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    idsByType.series.size
      ? supabase.from("series").select("id, title").in("id", [...idsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
  ]);
  if (books.error) throw books.error;
  if (movies.error) throw movies.error;
  if (series.error) throw series.error;

  const titleByKey = new Map<string, string>();
  for (const r of books.data ?? []) titleByKey.set(`book:${r.id}`, r.title);
  for (const r of movies.data ?? []) titleByKey.set(`movie:${r.id}`, r.title);
  for (const r of series.data ?? []) titleByKey.set(`series:${r.id}`, r.title);

  return rows.map((r) => ({
    id: r.id,
    itemType: r.item_type,
    itemId: r.item_id,
    kind: r.kind,
    body: r.body,
    position: parsePosition(r.item_type, r.position),
    isFavorite: r.is_favorite,
    tags: tagsOf(r.meta),
    isSpoiler: r.is_spoiler,
    isPublic: r.is_public,
    createdAt: r.created_at,
    itemTitle: titleByKey.get(`${r.item_type}:${r.item_id}`) ?? null,
  }));
}

// Una nota por id, con el título de la obra resuelto. RLS la acota al dueño: si
// el id no existe o es de otro, devuelve null. La usa el export de la cita (F6).
export async function getNoteById(
  supabase: SupabaseServerClient,
  id: string,
): Promise<Note | null> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, item_type, item_id, kind, body, position, is_favorite, meta, is_spoiler, is_public, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const r = data as Row;

  const { data: titleRow } = await supabase
    .from(r.item_type === "book" ? "books" : r.item_type === "movie" ? "movies" : "series")
    .select("title")
    .eq("id", r.item_id)
    .maybeSingle();

  return {
    id: r.id,
    itemType: r.item_type,
    itemId: r.item_id,
    kind: r.kind,
    body: r.body,
    position: parsePosition(r.item_type, r.position),
    isFavorite: r.is_favorite,
    tags: tagsOf(r.meta),
    isSpoiler: r.is_spoiler,
    isPublic: r.is_public,
    createdAt: r.created_at,
    itemTitle: (titleRow as { title: string } | null)?.title ?? null,
  };
}

// Contadores del rail del Rincón (frame H): citas / notas / favoritas.
export function countNotes(notes: Note[]): NoteCounts {
  let quotes = 0;
  let plain = 0;
  let favorites = 0;
  for (const n of notes) {
    if (n.kind === "quote") quotes++;
    else plain++;
    if (n.isFavorite) favorites++;
  }
  return { quotes, notes: plain, favorites, total: notes.length };
}

// Las notas del usuario para UNA obra, para la lista de la ficha. Sin orden en
// SQL: lo pone compareNotes en el cliente del servidor (src/lib/notes/sort.ts),
// porque ordenar por un jsonb con dos formas distintas desde SQL exigiría un
// índice de expresión por tipo de ítem para nada.
//
// Nota: cuelgan del ÍTEM, no del pase, así que esto trae también las notas de
// relecturas anteriores — que es lo que queremos (cada tarjeta lleva su fecha).
export async function getNotesForItem(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, item_type, item_id, kind, body, position, is_favorite, meta, is_spoiler, is_public, created_at",
    )
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  if (error) throw error;

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    itemType: r.item_type,
    itemId: r.item_id,
    kind: r.kind,
    body: r.body,
    position: parsePosition(r.item_type, r.position),
    isFavorite: r.is_favorite,
    tags: tagsOf(r.meta),
    isSpoiler: r.is_spoiler,
    isPublic: r.is_public,
    createdAt: r.created_at,
    itemTitle: null,
  }));
}
