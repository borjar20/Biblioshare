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
// Idempotente (upsert manual: comprobar y luego insertar, tragando 23505 si
// pierde la carrera contra otro request) y no debe romper el alta del libro:
// cualquier fallo aquí se traga entero, registrar la edición es una mejora,
// no un requisito para añadir el libro a la biblioteca.
async function ensureBookEdition(
  supabase: SupabaseServerClient,
  bookId: string,
  result: SearchResult,
  userId?: string | null
): Promise<void> {
  const isbn = result.isbn;
  // La política RLS exige isbn no nulo de 10 a 20 caracteres; sin eso el
  // insert lo rechazaría igualmente, así que ni lo intentamos.
  if (!isbn || isbn.length < 10 || isbn.length > 20) return;

  try {
    const { data: existing } = await supabase
      .from("book_editions")
      .select("id")
      .eq("book_id", bookId)
      .eq("isbn", isbn)
      .maybeSingle();
    if (existing) return;

    const { error } = await supabase.from("book_editions").insert({
      book_id: bookId,
      // Nombre neutro: no sabemos si es tapa dura, bolsillo, etc. — solo que
      // es la edición de este ISBN concreto.
      label: "Edición",
      publisher: result.publisher,
      published_year: result.year,
      total_pages: result.pageCount,
      isbn,
      cover_url: result.coverUrl,
      created_by: userId ?? null,
    } as never);

    // 23505: otro request insertó el mismo (book_id, isbn) primero — ya
    // existe, éxito igualmente (índice único parcial de la migración).
    if (error && error.code !== "23505") {
      console.error("ensureBookEdition insert failed", { bookId, isbn, error });
    }
  } catch (error) {
    console.error("ensureBookEdition failed", { bookId, isbn, error });
  }
}
