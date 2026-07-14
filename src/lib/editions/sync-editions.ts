import type { createClient } from "@/lib/supabase/server";
import { fetchWorkEditions, resolveWorkKey } from "@/lib/catalog/openlibrary/editions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SyncableBook = {
  id: string;
  openlibrary_work_key: string | null;
  isbn: string | null;
  editions_synced_at: string | null;
};

// Marca el libro como sincronizado. Se llama tanto cuando SÍ se importaron
// ediciones como cuando deliberadamente no se importó ninguna (ver comentario
// más abajo): en ambos casos la ficha no debe volver a preguntar.
async function markSynced(supabase: SupabaseServerClient, bookId: string): Promise<void> {
  await supabase
    .from("books")
    .update({ editions_synced_at: new Date().toISOString() })
    .eq("id", bookId);
}

// Cache-as-you-go de las ediciones reales de un libro (mismo patrón que
// ensureItemEnriched en src/lib/people/enrich-item.ts): la primera vez que se
// abre su ficha se traen desde OpenLibrary y se registran con la RPC
// register_book_edition; las siguientes visitas no vuelven a llamar a la API
// porque `editions_synced_at` ya está puesta. NUNCA lanza: un fallo aquí (red,
// RPC, lo que sea) no puede romper el render de la ficha, que se pinta igual
// con las ediciones que ya hubiera.
export async function ensureBookEditions(
  supabase: SupabaseServerClient,
  book: SyncableBook
): Promise<void> {
  try {
    // 1. Ya sincronizado (aunque el resultado fuera "nada que importar"): no
    // se repite la llamada a OpenLibrary en cada visita a la ficha.
    if (book.editions_synced_at !== null) return;

    let workKey = book.openlibrary_work_key;

    // 2. Sin work key propia: se intenta resolver por ISBN (caso de las
    // altas antiguas, de cuando el catálogo usaba Google Books) y, si se
    // resuelve, se guarda para no tener que repetir esta resolución.
    if (!workKey && book.isbn) {
      workKey = await resolveWorkKey(book.isbn);
      if (workKey) {
        await supabase
          .from("books")
          .update({ openlibrary_work_key: workKey })
          .eq("id", book.id);
      }
    }

    // Sin work key (ni propia ni resoluble por ISBN) no hay forma de pedirle
    // ediciones a OpenLibrary para esta obra. Se marca sincronizado IGUAL:
    // una obra sin work key no va a conseguir una en la próxima visita, así
    // que reintentar solo repetiría el mismo fallo en cada ficha abierta.
    if (!workKey) {
      await markSynced(supabase, book.id);
      return;
    }

    // fetchWorkEditions nunca lanza (ver openlibrary/editions.ts): si la API
    // falla o tarda, se degrada a lista vacía, no a excepción.
    const editions = await fetchWorkEditions(workKey);

    // 3. Sin ediciones que traer (obra oscura sin catalogar en OpenLibrary, o
    // la llamada falló): se marca sincronizado de todos modos. Esto es
    // DELIBERADO, no un bug — una obra sin ediciones no puede pagar una
    // llamada a una API externa en cada visita a su ficha; si algún día
    // OpenLibrary la cataloga, no hay forma automática de enterarse, pero el
    // coste de preguntar en cada visita para la inmensa mayoría de obras que
    // nunca tendrán ediciones ahí es peor que ese caso raro.
    if (editions.length === 0) {
      await markSynced(supabase, book.id);
      return;
    }

    // 4. Alta de cada edición vía RPC (única vía: valida el ISBN, sanea
    // rangos y firma created_by del lado del servidor). Un ISBN ya
    // registrado (duplicado) devuelve null: es idempotente, no un fallo.
    // Cualquier otro error individual también se ignora — una edición que no
    // se pudo registrar no debe impedir que se registren las demás.
    //
    // EN PARALELO (Hallazgo 4 de la revisión final): hasta veinte ediciones
    // (DEFAULT_LIMIT en openlibrary/editions.ts) no tienen ninguna
    // dependencia entre sí, así que encadenarlas una a una solo sumaba
    // veinte viajes de ida y vuelta a la base de datos sin ninguna razón.
    // Promise.allSettled (no Promise.all) porque el fallo de una no debe
    // tirar las demás — mismo espíritu que el bucle secuencial que sustituye.
    await Promise.allSettled(
      editions.map((edition) =>
        supabase.rpc("register_book_edition", {
          p_book_id: book.id,
          p_isbn: edition.isbn,
          p_label: edition.label,
          p_publisher: edition.publisher ?? undefined,
          p_year: edition.year ?? undefined,
          p_pages: edition.totalPages ?? undefined,
          p_cover_url: edition.coverUrl ?? undefined,
        })
      )
    );

    // 5. Hecho: no se vuelve a sincronizar este libro.
    await markSynced(supabase, book.id);
  } catch (error) {
    console.error("ensureBookEditions failed", { bookId: book.id, error });
  }
}
