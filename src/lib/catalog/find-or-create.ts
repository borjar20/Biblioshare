import type { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const TABLE_BY_TYPE = {
  book: "books",
  movie: "movies",
  series: "series",
} as const;

const ID_COLUMN_BY_TYPE = {
  book: "google_books_id",
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
          google_books_id: result.externalId,
          // google_books_id se queda tal cual por compatibilidad (es el que
          // usa el índice/lookup de arriba), pero cuando el externalId YA es
          // una work key de OpenLibrary (búsqueda actual, no import viejo de
          // Google Books) se guarda también en su columna honesta: así el
          // libro nace ya sincronizable sin tener que resolverla por ISBN.
          openlibrary_work_key: result.externalId.startsWith("/works/")
            ? result.externalId
            : null,
          title: result.title,
          author: result.subtitle,
          cover_url: result.coverUrl,
          published_year: result.year,
          publisher: result.publisher,
          total_pages: result.pageCount,
          isbn: result.isbn,
          synopsis: result.synopsis,
          genres: result.genres,
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

// Registra el ISBN elegido en la búsqueda como edición de la obra (Tarea 4b,
// ver supabase/migrations/20260714_editions_from_search.sql). Sin esto la
// información de qué edición concreta escogió el usuario se tiraba: Google
// Books devuelve varias ediciones por obra (group-editions.ts las agrupa
// para la tarjeta de búsqueda) y group-editions se queda solo con la más
// completa como representante, perdiendo el resto.
//
// El insert directo a book_editions ya no es una opción: dejaba a cualquier
// autenticado escribir editorial/portada/páginas inventadas en cualquier
// libro con solo poner algo de 10-20 caracteres en isbn, sin ser colaborador
// (ver supabase/migrations/20260714_editions_hardening.sql). Pasamos por la
// función register_book_edition, que valida el ISBN de verdad (dígito de
// control incluido), sanea año/páginas fuera de rango y firma created_by con
// auth.uid() del lado del servidor — no del userId que le pasemos aquí.
//
// La función ya es idempotente (upsert vía on conflict do nothing) y ya no
// debe romper el alta del libro: un ISBN inválido es ahora un error legítimo
// y esperable (viene tal cual de Google Books), así que cualquier fallo aquí
// se traga entero — registrar la edición es una mejora, no un requisito para
// añadir el libro a la biblioteca.
async function ensureBookEdition(
  supabase: SupabaseServerClient,
  bookId: string,
  result: SearchResult,
  userId?: string | null
): Promise<void> {
  const isbn = result.isbn;
  // register_book_edition exige auth.uid() no nulo (raise exception si no
  // hay sesión) y lo usa para firmar created_by; sin isbn o sin usuario
  // autenticado la llamada está condenada a fallar, así que ni la intentamos
  // (los flujos de cache oportunista sin usuario, ver comentario de arriba,
  // simplemente no registran edición).
  if (!isbn || !userId) return;

  try {
    const { error } = await supabase.rpc("register_book_edition", {
      p_book_id: bookId,
      p_isbn: isbn,
      p_publisher: result.publisher ?? undefined,
      p_year: result.year ?? undefined,
      p_pages: result.pageCount ?? undefined,
      p_cover_url: result.coverUrl ?? undefined,
    });

    if (error) {
      console.error("ensureBookEdition rpc failed", { bookId, isbn, error });
    }
  } catch (error) {
    console.error("ensureBookEdition failed", { bookId, isbn, error });
  }
}
