import { createPublicClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

// Las series no tienen ediciones: su unidad de progreso son los episodios.
//
// `freshRead` rompe deliberadamente la memoización de fetch de Next: la
// ficha de libro llama a getEditions TRES VECES en la misma request
// (page.tsx:224 y page.tsx:365, ambas para consumidores síncronos — editor,
// registro — con freshRead=false por defecto, y una tercera dentro de
// loadBookEditions, para la tira que streamea por <Suspense>, con
// freshRead=true). Las dos primeras son byte-a-byte la misma petición GET
// (mismo método, misma URL): Next las deduplica solo a ellas vía la
// memoización de fetch, así que en la práctica son una sola llamada de red.
// La tercera lleva `id` como desempate para que su URL sea distinta y no
// sirva (ni reciba) una respuesta cacheada de las otras dos — necesario
// porque loadBookEditions pide una lectura fresca a propósito.
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
