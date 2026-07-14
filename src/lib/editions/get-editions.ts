import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Las series no tienen ediciones: su unidad de progreso son los episodios.
export async function getEditions(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<Edition[]> {
  if (itemType === "series") return [];

  if (itemType === "book") {
    const { data } = await supabase
      .from("book_editions")
      .select("id, label, publisher, published_year, language, total_pages, isbn, cover_url, is_primary")
      .eq("book_id", itemId)
      .order("is_primary", { ascending: false })
      .order("published_year", { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      publisher: r.publisher,
      year: r.published_year,
      language: r.language,
      totalUnits: r.total_pages,
      isbn: r.isbn,
      coverUrl: r.cover_url,
      isPrimary: r.is_primary,
    }));
  }

  const { data } = await supabase
    .from("movie_versions")
    .select("id, label, release_year, duration_minutes, is_primary")
    .eq("movie_id", itemId)
    .order("is_primary", { ascending: false })
    .order("release_year", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    publisher: null,
    year: r.release_year,
    language: null,
    totalUnits: r.duration_minutes,
    isbn: null,
    coverUrl: null,
    isPrimary: r.is_primary,
  }));
}
