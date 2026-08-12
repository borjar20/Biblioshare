import type { createClient } from "@/lib/supabase/server";
import { chunkIds } from "@/lib/supabase/in-chunks";
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

// Extraído para que el alta de UNO y el alta EN LOTE construyan exactamente la
// misma fila y no puedan divergir.
function catalogInsertPayload(result: SearchResult) {
  return result.itemType === "book"
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
        // Título original (idioma de rodaje/emisión) para que el matcher de
        // importación case aunque `title` esté traducido a es-ES. Ver
        // decisiones.md 2026-08-02.
        original_title: result.originalTitle ?? null,
        cover_url: result.coverUrl,
        release_year: result.year,
        synopsis: result.synopsis,
        genres: result.genres,
      };
}

/**
 * Alta de catálogo EN LOTE: un `select` + un `insert` POR TIPO, en vez de dos
 * consultas por ítem. Devuelve `${itemType}:${externalId}` -> id de catálogo.
 *
 * Existe por la hidratación de la ficha de persona: una filmografía de 300
 * créditos por el camino de uno-en-uno son ~600 viajes a la base dentro de un
 * render. Con el lote, la hidratación entera son ~6 consultas.
 *
 * NO registra ediciones de libro (`ensureBookEdition`): eso necesita el ISBN de
 * la tirada que el usuario tiene en la mano y un userId, y el lote no tiene ni
 * lo uno ni lo otro. Ese camino se queda en `findOrCreateCatalogItem`.
 *
 * NUNCA lanza: el llamador es un render de lectura. Si el insert falla se
 * devuelven los que sí se resolvieron.
 *   - 42501 = visitante ANÓNIMO sin grant de escritura sobre el catálogo.
 *     Esperado e inocuo desde la navegación anónima (#359/#360): la ficha se
 *     pinta igual desde la respuesta de la API y persiste el primer visitante
 *     con sesión. No se registra.
 *   - 23505 = otro render insertó los mismos ítems a la vez. Se recuperan los
 *     ids re-seleccionando el lote entero, igual que findOrCreatePeopleByTmdb.
 */
export async function findOrCreateCatalogItemsBulk(
  supabase: SupabaseServerClient,
  results: SearchResult[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (results.length === 0) return map;

  const byType = new Map<SearchResult["itemType"], Map<string, SearchResult>>();
  for (const r of results) {
    let bucket = byType.get(r.itemType);
    if (!bucket) {
      bucket = new Map();
      byType.set(r.itemType, bucket);
    }
    if (!bucket.has(r.externalId)) bucket.set(r.externalId, r);
  }

  await Promise.all(
    [...byType.entries()].map(async ([itemType, bucket]) => {
      const table = TABLE_BY_TYPE[itemType];
      const idColumn = ID_COLUMN_BY_TYPE[itemType];
      const externalIds = [...bucket.keys()];
      const queryIds =
        itemType === "book" ? externalIds : externalIds.map((id) => Number(id));

      // TROCEADO por precaución: supabase-js manda el `.in()` en la cadena de
      // consulta, y una filmografía de 300 ids son ~11 KB de URL. Si esa
      // petición fallara, el lote creería que no existe ninguna obra y las
      // insertaría todas de nuevo. No es el arreglo de un fallo observado — ver
      // el comentario de in-chunks.ts.
      const readExisting = async () => {
        await Promise.all(
          chunkIds<string | number>(queryIds).map(async (ids) => {
            const { data } = await supabase
              .from(table)
              .select(`id, ${idColumn}`)
              .in(idColumn as never, ids as never);
            for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
              map.set(`${itemType}:${String(row[idColumn])}`, row.id as string);
            }
          })
        );
      };

      await readExisting();

      const missing = externalIds.filter((id) => !map.has(`${itemType}:${id}`));
      if (missing.length === 0) return;

      const payload = missing.map((id) => catalogInsertPayload(bucket.get(id)!));

      const { data: inserted, error } = await supabase
        .from(table)
        .insert(payload as never)
        .select(`id, ${idColumn}`);

      if (error) {
        if (error.code === "23505") {
          await readExisting();
        } else if (error.code !== "42501") {
          console.error("catalog bulk insert failed", {
            itemType,
            count: payload.length,
            error,
          });
        }
        return;
      }

      for (const row of (inserted ?? []) as unknown as Array<Record<string, unknown>>) {
        map.set(`${itemType}:${String(row[idColumn])}`, row.id as string);
      }
    })
  );

  return map;
}

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

  const payload = catalogInsertPayload(result);

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
