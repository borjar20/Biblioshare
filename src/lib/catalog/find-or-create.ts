import type { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Alta de catálogo EN LOTE: una RPC de registro + una RPC de hidratación POR
 * TIPO, en vez de dos consultas por ítem. Devuelve `${itemType}:${externalId}`
 * -> id de catálogo.
 *
 * Existe por la hidratación de la ficha de persona: una filmografía de 300
 * créditos por el camino de uno-en-uno son ~600 viajes a la base dentro de un
 * render. Con el lote, la hidratación entera son ~6 consultas (2 por tipo).
 *
 * #674: la shell nace SOLO con el id externo vía `register_catalog_items_bulk`
 * (SECURITY DEFINER, on-conflict-do-nothing + re-select interno — YA devuelve
 * el par existente+nuevo, así que no hace falta el select previo ni el
 * troceo con chunkIds que tenía la versión con insert directo). Para
 * película/serie, tras registrar las shells se hidratan con los canónicos que
 * el `SearchResult` YA trae (title/original_title/synopsis/genres/year/cover)
 * vía `hydrate_screens_bulk`, fill-only (nunca pisa curación). A diferencia
 * del alta de UNO (`findOrCreateCatalogItem`), aquí SÍ usamos los canónicos
 * del resultado porque el origen es servidor fiable (TMDB
 * `getPersonCombinedCredits`), no un cliente.
 *
 * `director`/`creator` y las duraciones/temporadas/episodios NO viven en
 * `SearchResult` — quedan sin hidratar en el lote y los completa la apertura
 * de ficha (`ensureMovieHydrated`/`ensureSeriesHydrated`).
 *
 * Los libros SOLO se registran (shell), nunca se hidratan aquí: la ficha de
 * libro hidrata (`ensureBookHydrated`) y el lote de créditos de persona rara
 * vez trae sinopsis de libro de todos modos.
 *
 * NO registra ediciones de libro (`ensureBookEdition`): eso necesita el ISBN de
 * la tirada que el usuario tiene en la mano y un userId, y el lote no tiene ni
 * lo uno ni lo otro. Ese camino se queda en `findOrCreateCatalogItem`.
 *
 * NUNCA lanza: el llamador es un render de lectura. Un fallo (incl. "sin
 * sesión" — la RPC exige `auth.uid()` y lanza si no hay— o cualquier error de
 * red) se registra con `console.error` y ese tipo se devuelve sin resolver;
 * el resto de tipos sigue su camino porque cada uno corre en su propio
 * try/catch dentro del `Promise.all`.
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
      const externalIds = [...bucket.keys()];

      try {
        const { data, error } = await supabase.rpc("register_catalog_items_bulk", {
          p_item_type: itemType,
          p_external_ids: externalIds,
        });
        if (error) {
          console.error("register_catalog_items_bulk failed", {
            itemType,
            count: externalIds.length,
            error,
          });
          return;
        }
        for (const row of (data ?? []) as Array<{ external_id: string; id: string }>) {
          map.set(`${itemType}:${row.external_id}`, row.id);
        }
      } catch (error) {
        console.error("register_catalog_items_bulk failed", {
          itemType,
          count: externalIds.length,
          error,
        });
        return;
      }

      if (itemType !== "movie" && itemType !== "series") return;

      const rows = externalIds
        .map((externalId) => {
          const result = bucket.get(externalId)!;
          return {
            item_id: map.get(`${itemType}:${externalId}`),
            title: result.title,
            original_title: result.originalTitle ?? null,
            synopsis: result.synopsis,
            genres: result.genres,
            release_year: result.year,
            cover_url: result.coverUrl,
            // director/creator, duration_minutes/total_seasons/total_episodes/
            // episode_runtime_minutes NO viven en SearchResult: quedan ausentes
            // aquí y los completa la apertura de ficha
            // (ensureMovieHydrated/ensureSeriesHydrated). #674.
          };
        })
        .filter((row): row is typeof row & { item_id: string } => Boolean(row.item_id));

      if (rows.length === 0) return;

      try {
        const { error } = await supabase.rpc("hydrate_screens_bulk", {
          p_item_type: itemType,
          p_rows: rows,
        });
        if (error) {
          console.error("hydrate_screens_bulk failed", { itemType, count: rows.length, error });
        }
      } catch (error) {
        console.error("hydrate_screens_bulk failed", { itemType, count: rows.length, error });
      }
    })
  );

  return map;
}

// Shared by the search flow (persists newly-seen API results into the
// catalog right away, see docs/REQUIREMENTS.md §7.32) and by add-to-library
// (fallback for results that arrived without a catalogId, e.g. mock mode).
//
// #674: el cliente NO fija canónicos (title/synopsis/genres/...) — los
// descartamos de `result` a propósito. La shell nace con solo el id externo
// vía RPC definer (idempotente: inserta o re-selecciona), y los campos de
// ficha los pone la hidratación server-side. `userId` ya no firma
// `created_by` (eso lo hace `auth.uid()` dentro de la RPC); se conserva en la
// firma solo porque `ensureBookEdition` lo necesita.
export async function findOrCreateCatalogItem(
  supabase: SupabaseServerClient,
  result: SearchResult,
  userId?: string | null
): Promise<string> {
  const { data: id, error } = await supabase.rpc("register_catalog_item", {
    p_item_type: result.itemType,
    p_external_id: result.externalId,
  });
  if (error || !id) throw error ?? new Error("register_catalog_item returned no id");

  // La edición del libro (ISBN escaneado) sigue su camino validado server-side.
  if (result.itemType === "book") {
    await ensureBookEdition(supabase, id as string, result, userId);
  }
  return id as string;
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
