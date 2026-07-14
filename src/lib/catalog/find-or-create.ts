import type { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const TABLE_BY_TYPE = {
  book: "books",
  movie: "movies",
  series: "series",
} as const;

const ID_COLUMN_BY_TYPE = {
  book: "openlibrary_work_key",
  movie: "tmdb_id",
  series: "tmdb_id",
} as const;

// Shared by the search flow (persists newly-seen API results into the
// catalog right away, see docs/REQUIREMENTS.md §7.32) and by add-to-library
// (fallback for results that arrived without a catalogId, e.g. mock mode).
//
// userId es opcional: se rellena created_by cuando ya tenemos al usuario a
// mano (alta desde /buscar), y se deja nulo cuando no (cache oportunista
// durante la propia búsqueda, que puede correr para un visitante anónimo).
export async function findOrCreateCatalogItem(
  supabase: SupabaseServerClient,
  result: SearchResult,
  userId?: string | null
): Promise<string> {
  const table = TABLE_BY_TYPE[result.itemType];
  const idColumn = ID_COLUMN_BY_TYPE[result.itemType];
  const externalId =
    result.itemType === "book" ? result.externalId : Number(result.externalId);

  const { data: existing } = await supabase
    .from(table)
    .select("id")
    .eq(idColumn as never, externalId)
    .maybeSingle();
  if (existing) {
    if (result.itemType === "book") {
      await ensureBookEdition(supabase, existing.id, result, userId);
    }
    return existing.id;
  }

  const payload =
    result.itemType === "book"
      ? {
          openlibrary_work_key: result.externalId,
          title: result.title,
          author: result.subtitle,
          cover_url: result.coverUrl,
          published_year: result.year,
          // synopsis y genres NO se escriben aquí: la obra nace ligera y la
          // hidrata ensureBookHydrated al abrir su ficha (peldaño 2). Editorial,
          // ISBN y páginas tampoco: son de la tirada, y los pone el trigger
          // desde la edición primaria. Ver el spec de 2026-07-14.
        }
      : {
          tmdb_id: Number(result.externalId),
          title: result.title,
          cover_url: result.coverUrl,
          release_year: result.year,
          synopsis: result.synopsis,
          genres: result.genres,
        };

  // The insert shape differs per item type (picked above); this cast is the
  // single spot where the three catalog tables' insert types are reconciled.
  const { data: inserted, error } = await supabase
    .from(table)
    .insert(payload as never)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Race: another request inserted the same external id first.
      const { data: raceRow } = await supabase
        .from(table)
        .select("id")
        .eq(idColumn as never, externalId)
        .single();
      if (raceRow) {
        if (result.itemType === "book") {
          await ensureBookEdition(supabase, raceRow.id, result, userId);
        }
        return raceRow.id;
      }
    }
    throw error;
  }

  if (result.itemType === "book") {
    await ensureBookEdition(supabase, inserted.id, result, userId);
  }

  return inserted.id;
}

// Registra la tirada que el usuario tiene EN LA MANO como edición de la obra.
// Solo el lookup por ISBN (escáner de código de barras, importador de Goodreads)
// sabe cuál es: una búsqueda por texto devuelve la obra y punto, y sus ediciones
// las trae ensureBookEditions al abrir la ficha. De ahí que la única fuente aquí
// sea `matchedIsbn`.
//
// El insert directo a book_editions no es una opción: dejaba a cualquier
// autenticado escribir editorial/portada/páginas inventadas en cualquier libro
// sin ser colaborador. Pasamos por register_book_edition, que valida el ISBN de
// verdad (dígito de control incluido), sanea rangos y firma created_by con
// auth.uid() del lado del servidor — no con el userId que le pasemos aquí.
//
// Es idempotente (on conflict do nothing) y no debe romper el alta del libro:
// cualquier fallo se traga entero, porque registrar la edición es una mejora, no
// un requisito para añadir el libro a la biblioteca.
async function ensureBookEdition(
  supabase: SupabaseServerClient,
  bookId: string,
  result: SearchResult,
  userId?: string | null
): Promise<void> {
  const isbn = result.matchedIsbn;
  // register_book_edition exige auth.uid() no nulo (raise exception si no hay
  // sesión) y lo usa para firmar created_by; sin isbn o sin usuario autenticado
  // la llamada está condenada a fallar, así que ni la intentamos.
  if (!isbn || !userId) return;

  try {
    // Editorial, año y páginas de la tirada NO se pasan: no los tenemos (el
    // resultado de búsqueda ya no los lleva) y los traerá el sync de ediciones
    // desde OpenLibrary, que sí sabe de qué tirada son.
    const { error } = await supabase.rpc("register_book_edition", {
      p_book_id: bookId,
      p_isbn: isbn,
      p_cover_url: result.coverUrl ?? undefined,
    });

    if (error) {
      console.error("ensureBookEdition rpc failed", { bookId, isbn, error });
    }
  } catch (error) {
    console.error("ensureBookEdition failed", { bookId, isbn, error });
  }
}
