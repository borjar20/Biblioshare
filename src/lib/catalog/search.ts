import { createClient } from "@/lib/supabase/server";
import { searchWorks } from "./openlibrary/work-search";
import { lookupIsbn } from "./openlibrary/isbn-lookup";
import { searchMovies, searchSeries } from "./tmdb";
import { MOCK_BOOKS, MOCK_MOVIES, MOCK_SERIES } from "./mock-data";
import { normalizeIsbn } from "./isbn";
import { searchLocalCatalog, findLocalBookByIsbn } from "./local-search";
import { mergeByExternalId } from "./merge-results";
import { searchInventaireEntities } from "./inventaire/client";
import { collapseByWikidata } from "./wikidata-collapse";
import type { ItemType, SearchResult } from "./types";

// PELDAÑO 1 de la escalera de hidratación (ver docs/REQUIREMENTS.md §7.32 y el
// spec de 2026-07-14). Dos reglas, que sustituyen a las de antes:
//
// 1. LA BÚSQUEDA NO ESCRIBE EN LA BASE DE DATOS. Antes se persistía cada
//    resultado de la API nada más verlo, lo que llenaba `books` de obras que
//    nadie llegaba a mirar y con datos de edición inventados (las páginas eran
//    la MEDIANA de todas las tiradas). La fila nace al ABRIR la ficha o al
//    AÑADIR el libro, y nace hidratada.
//
// 2. EL ÚNICO ATAJO ES EL ISBN. Un ISBN es un lookup de una tirada concreta (el
//    escáner de código de barras), así que si ya la tenemos cacheada no se llama
//    a la API. Una búsqueda por TEXTO siempre pregunta a OpenLibrary y fusiona
//    con lo local: cortocircuitarla con un hit local escondía el resto de obras
//    ("dune" no enseñaba "Dune Messiah") y dejaba los registros sucios sin curar
//    para siempre.
export async function searchCatalog(
  itemType: ItemType,
  query: string
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (process.env.MOCK_EXTERNAL_APIS === "true") {
    return searchMockData(itemType, trimmed);
  }

  const supabase = await createClient();

  if (itemType === "book") {
    const isbn = normalizeIsbn(trimmed);
    if (isbn) {
      const cached = await findLocalBookByIsbn(supabase, isbn);
      if (cached) return [cached];

      const found = await lookupIsbn(isbn);
      return found ? [found] : [];
    }

    // Tercera pasada, en paralelo con las otras dos: Inventaire, que es la
    // única fuente que sabe que un work en español y otro en inglés son la
    // MISMA obra (comparten entidad de Wikidata). Dependencia BLANDA — ver
    // inventaire/client.ts — así que su fallo no tumba la búsqueda: se degrada
    // a búsqueda sin colapso, con los duplicados que ya había antes de esto.
    const [local, api, entities] = await Promise.all([
      searchLocalCatalog(supabase, "book", trimmed),
      searchWorks(trimmed),
      searchInventaireEntities(trimmed).catch(() => []),
    ]);
    return collapseByWikidata(mergeByExternalId(local, api), entities);
  }

  // Películas y series: TMDB ya devuelve datos limpios y géneros de vocabulario
  // cerrado, así que su búsqueda no cambia — solo se le aplica la misma fusión
  // local + API, por el id de TMDB.
  const [local, api] = await Promise.all([
    searchLocalCatalog(supabase, itemType, trimmed),
    itemType === "movie" ? searchMovies(trimmed) : searchSeries(trimmed),
  ]);
  return mergeByExternalId(local, api);
}

function searchMockData(itemType: ItemType, query: string): SearchResult[] {
  const pool =
    itemType === "book" ? MOCK_BOOKS : itemType === "movie" ? MOCK_MOVIES : MOCK_SERIES;

  if (itemType === "book") {
    const isbn = normalizeIsbn(query);
    if (isbn) return pool.filter((item) => item.matchedIsbn === isbn);
  }

  const needle = query.toLowerCase();
  return pool.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      item.subtitle?.toLowerCase().includes(needle)
  );
}
