import { createPublicClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

// Las series no tienen ediciones: su unidad de progreso son los episodios.
//
// `freshRead` rompe deliberadamente la memoización de fetch de Next: la
// ficha de libro llama a getEditions DOS VECES en la misma request (una para
// los consumidores síncronos — editor, registro — y otra dentro de
// loadBookEditions, para la tira que streamea por <Suspense>). Sin
// diferenciarlas, ambas llamadas son byte-a-byte la misma petición GET (mismo
// método, misma URL), y Next serviría la segunda desde la caché de la
// primera. Añadir `id` como desempate no cambia el resultado (ya era
// determinista sin él) pero sí cambia la URL de la petición, así que ninguna
// llamada sirve una respuesta cacheada de la otra.
// Cliente SIN sesión (`book_editions`/`movie_versions` son `SELECT USING (true)`):
// resultado idéntico para todos → cacheable en Fase 4 (#436). loadBookEditions
// solo LEE (Tarea 10: el sync masivo de ediciones murió), así que hoy las dos
// llamadas devolverían lo mismo aunque compartieran caché — el desempate se
// deja igualmente, por si alguna de las dos rutas vuelve a escribir.
export async function getEditions(
  itemType: ItemType,
  itemId: string,
  freshRead = false
): Promise<Edition[]> {
  if (itemType === "series") return [];

  const supabase = createPublicClient();

  if (itemType === "book") {
    let query = supabase
      .from("book_editions")
      .select("id, label, publisher, published_year, language, total_pages, isbn, cover_url")
      .eq("book_id", itemId)
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
    }));
  }

  const { data } = await supabase
    .from("movie_versions")
    .select("id, label, release_year, duration_minutes")
    .eq("movie_id", itemId)
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
  }));
}
