import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Las series no tienen ediciones: su unidad de progreso son los episodios.
//
// `freshRead` rompe deliberadamente la memoización de fetch de Next: la
// ficha de libro llama a getEditions DOS VECES en la misma request (una para
// los consumidores síncronos — editor, registro — y otra dentro de
// loadBookEditions, DESPUÉS de sincronizar con OpenLibrary, para la tira que
// streamea por <Suspense>). Sin diferenciarlas, ambas llamadas son
// byte-a-byte la misma petición GET (mismo método, misma URL), y Next sirve
// la segunda desde la caché de la primera — es decir, devuelve la lista
// VACÍA de antes de sincronizar, aunque para entonces la sincronización ya
// haya escrito ediciones reales en la base de datos. El bug se veía como "la
// tira nunca sale de su placeholder salvo que recargues", pese a que la fila
// en la base de datos era correcta. Añadir `id` como desempate no cambia el
// resultado (ya era determinista sin él) pero sí cambia la URL de la
// petición, así que ninguna llamada sirve una respuesta cacheada de la otra.
export async function getEditions(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
  freshRead = false
): Promise<Edition[]> {
  if (itemType === "series") return [];

  if (itemType === "book") {
    let query = supabase
      .from("book_editions")
      .select("id, label, publisher, published_year, language, total_pages, isbn, cover_url, is_primary")
      .eq("book_id", itemId)
      .order("is_primary", { ascending: false })
      .order("published_year", { ascending: false });
    if (freshRead) query = query.order("id", { ascending: true });
    const { data } = await query;

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
