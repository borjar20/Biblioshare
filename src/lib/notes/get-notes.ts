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
  created_at: string;
};

function pageOf(position: unknown, itemType: ItemType): number | null {
  const parsed = parsePosition(itemType, position);
  return "page" in parsed && parsed.page !== undefined ? parsed.page : null;
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
    .select("id, item_type, item_id, kind, body, position, is_favorite, created_at")
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
    page: pageOf(r.position, r.item_type),
    isFavorite: r.is_favorite,
    createdAt: r.created_at,
    itemTitle: titleByKey.get(`${r.item_type}:${r.item_id}`) ?? null,
  }));
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
