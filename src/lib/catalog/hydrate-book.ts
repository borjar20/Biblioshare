import type { createClient } from "@/lib/supabase/server";
import { fetchWork, fetchFirstEditionDescription } from "./openlibrary/work-detail";
import { fetchOpenLibraryAuthorByKey } from "./openlibrary/work-authors";
import { resolveWorkKey } from "./openlibrary/editions";
import { mapSubjectsToGenres } from "./genres";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HydratableBook = {
  id: string;
  openlibrary_work_key: string | null;
  isbn: string | null;
  hydrated_at: string | null;
};

// PELDAÑO 2 de la escalera de hidratación (spec de 2026-07-14): la primera vez
// que se abre la ficha de una obra se traen de OpenLibrary los datos que la
// ficha muestra y que la búsqueda ya NO trae, y se guardan. Las siguientes
// visitas no vuelven a llamar a la API.
//
// Título y autor entran aquí desde el arreglo de #730. Antes no los escribía
// NADIE: desde #674 la fila nace vacía, y hydrate_book —a diferencia de
// hydrate_movie/hydrate_series— no tenía `p_title`. Como sí marcaba
// `hydrated_at`, la ficha se quedaba en «Sin título» de forma permanente.
//
// Hermano de ensureItemEnriched (créditos) y ensureBookEditions (tiradas), con
// el mismo contrato: idempotente, guarded por una columna, y NUNCA lanza — un
// fallo de una API externa no puede tumbar el render de la ficha.
//
// Escribe a través de la RPC hydrate_book, no con un update directo: synopsis,
// genres y cover_url son columnas curadas (solo collaborator+ puede cambiarlas,
// ver 20260714_editions_h_catalog_edit_grants.sql), y la RPC solo rellena los
// huecos — jamás pisa lo que un colaborador escribió a mano.
export async function ensureBookHydrated(
  supabase: SupabaseServerClient,
  book: HydratableBook
): Promise<void> {
  try {
    if (book.hydrated_at !== null) return;

    let workKey = book.openlibrary_work_key;

    // Sin work key propia (alta manual, import antiguo): se intenta resolver por
    // ISBN y se guarda, para no repetir la resolución en cada visita.
    //
    // El error del update se ignora a propósito, y desde #730 hay uno más que
    // ignorar: 23505, cuando esa work key ya la tiene otra fila del catálogo
    // (índice único). En los dos casos la hidratación sigue con la key resuelta
    // en memoria; lo único que se pierde es el atajo de no re-resolverla.
    if (!workKey && book.isbn) {
      workKey = await resolveWorkKey(book.isbn);
      if (workKey) {
        await supabase
          .from("books")
          .update({ openlibrary_work_key: workKey })
          .eq("id", book.id);
      }
    }

    // Sin work key no hay nada que pedirle a OpenLibrary sobre esta obra, y no va
    // a aparecer una en la próxima visita: se marca hidratada IGUAL, para no
    // repetir el intento fallido cada vez que se abre la ficha. Mismo criterio
    // deliberado que ensureBookEditions.
    if (!workKey) {
      await markHydrated(supabase, book.id);
      return;
    }

    const work = await fetchWork(workKey);
    // La API falló o tardó: NO se marca hidratada, se reintenta en la siguiente
    // visita. Mientras tanto, la ficha se pinta con lo que haya.
    if (!work) return;

    // La obra manda; si no trae sinopsis, se cae a la de alguna de sus ediciones
    // (una llamada extra, y solo en este caso).
    const synopsis = work.description ?? (await fetchFirstEditionDescription(workKey));
    const genres = mapSubjectsToGenres(work.subjects);

    // El nombre del autor NO viene en el work: el work lista claves, y el nombre
    // está en la ficha de cada autor. Se resuelve solo el primero —`books.author`
    // es un texto único, y el reparto completo lo escribe ensureItemEnriched en
    // `credits`— y solo si la obra declara alguno. La llamada la sirve la caché
    // de fetch de Next casi siempre: ensureItemEnriched pide esa misma ficha.
    const authorKey = work.authorKeys[0];
    const author = authorKey ? await fetchOpenLibraryAuthorByKey(authorKey) : null;

    const { error } = await supabase.rpc("hydrate_book", {
      p_book_id: book.id,
      p_title: work.title ?? undefined,
      p_author: author?.name ?? undefined,
      p_published_year: work.firstPublishYear ?? undefined,
      p_synopsis: synopsis ?? undefined,
      p_genres: genres.length > 0 ? genres : undefined,
      p_cover_url: work.coverUrl ?? undefined,
    });

    if (error) console.error("hydrate_book rpc failed", { bookId: book.id, error });
  } catch (error) {
    console.error("ensureBookHydrated failed", { bookId: book.id, error });
  }
}

// hydrate_book ya pone hydrated_at por su cuenta; esto es solo para el caso "no
// hay nada que hidratar", en el que ni siquiera se llega a llamar a la RPC.
async function markHydrated(
  supabase: SupabaseServerClient,
  bookId: string
): Promise<void> {
  await supabase
    .from("books")
    .update({ hydrated_at: new Date().toISOString() })
    .eq("id", bookId);
}
