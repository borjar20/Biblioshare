import type { createClient } from "@/lib/supabase/server";
import { findLocalBookByIsbn, searchLocalCatalog } from "@/lib/catalog/local-search";
import { searchWorks } from "@/lib/catalog/openlibrary/work-search";
import { lookupIsbn } from "@/lib/catalog/openlibrary/isbn-lookup";
import { getMovieAsSearchResult, searchMoviesForImport } from "@/lib/catalog/tmdb";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import { isSameTitle, normalizeTitle } from "@/lib/catalog/title-match";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportCandidate, ImportMatch, ImportRow } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Tope de candidatos que se le enseñan al usuario para desempatar. Pasado ese
// punto la lista deja de ayudar y se convierte en otra búsqueda que hacer a
// mano; TMDB ya los devuelve ordenados por relevancia, así que los de más abajo
// son ruido.
const MAX_CANDIDATES = 6;

// Local catalog hits already carry a catalogId (see local-search.ts); API
// hits need findOrCreateCatalogItem to persist them first (same pattern as
// the interactive search flow, src/lib/catalog/search.ts).
async function matchBook(
  supabase: SupabaseServerClient,
  row: ImportRow
): Promise<ImportMatch> {
  if (row.isbn) {
    const local = await findLocalBookByIsbn(supabase, row.isbn);
    if (local) return { kind: "matched", catalogId: local.catalogId! };

    // An ISBN precisely identifies the edition — trust Open Library's
    // ISBN-scoped result directly, even when its canonical title differs
    // from the CSV's shorthand title (e.g. "Nineteen Eighty-Four" vs
    // "1984"). No title check here (same as the interactive search flow).
    // El lookup devuelve la OBRA (con matchedIsbn anotado); sus ediciones las
    // traerá ensureBookEditions cuando alguien abra la ficha.
    const found = await lookupIsbn(row.isbn);
    if (found) {
      return { kind: "matched", catalogId: await findOrCreateCatalogItem(supabase, found) };
    }
  }

  const localTitleResults = await searchLocalCatalog(supabase, "book", row.title);
  const localTitleMatch = localTitleResults.find((r) => isSameTitle(r.title, row.title));
  if (localTitleMatch) return { kind: "matched", catalogId: localTitleMatch.catalogId! };

  const apiTitleResults = await searchWorks(row.title);
  const apiTitleMatch = apiTitleResults.find((r) => isSameTitle(r.title, row.title));
  if (apiTitleMatch) {
    return { kind: "matched", catalogId: await findOrCreateCatalogItem(supabase, apiTitleMatch) };
  }

  return { kind: "unmatched" };
}

function ambiguous(candidates: ImportCandidate[]): ImportMatch {
  return { kind: "ambiguous", candidates: candidates.slice(0, MAX_CANDIDATES) };
}

/**
 * El id de catálogo de un candidato elegido (por el matcher o por el usuario).
 *
 * El rodeo por `getMovieAsSearchResult` es para los candidatos que la búsqueda
 * es-ES no devolvió: llegan con el título y la sinopsis en inglés y darlos de
 * alta tal cual dejaría "Parasite" en un catálogo que en todas partes dice
 * "Parásitos". Solo cuesta una llamada extra y solo en esos casos.
 */
export async function catalogIdForMovieCandidate(
  supabase: SupabaseServerClient,
  candidate: ImportCandidate,
  userId?: string | null
): Promise<string> {
  if (candidate.catalogId) return candidate.catalogId;

  const spanish = candidate.spanishMissing
    ? await getMovieAsSearchResult(Number(candidate.externalId))
    : null;
  return findOrCreateCatalogItem(supabase, spanish ?? candidate, userId);
}

/**
 * Desempata quedándose solo con los candidatos cuyo título coincide EXACTO
 * (normalizado) con el del CSV, si los hay.
 *
 * `isSameTitle` acepta también la contención difusa, y eso empareja el
 * documental "The Making of 'Crouching Tiger, Hidden Dragon'" con la fila
 * "Crouching Tiger, Hidden Dragon" — antes incluso GANABA, por salir antes en
 * la lista. Una coincidencia exacta siempre debe pesar más que una por
 * contención; si no hay ninguna exacta, se sigue con las difusas.
 */
function preferExactTitle(candidates: ImportCandidate[], csvTitle: string): ImportCandidate[] {
  const target = normalizeTitle(csvTitle);
  const exact = candidates.filter((c) =>
    [c.title, c.originalTitle, c.englishTitle].some(
      (title) => title != null && normalizeTitle(title) === target
    )
  );
  return exact.length > 0 ? exact : candidates;
}

async function matchMovie(
  supabase: SupabaseServerClient,
  row: ImportRow
): Promise<ImportMatch> {
  // A candidate with no release year can't be verified against the CSV's
  // year, so it's only accepted when the CSV itself has no year either —
  // otherwise an obscure/junk entry with a blank release date would bypass
  // the year check entirely.
  const sameYear = (year: number | null) => {
    if (row.year === null) return true;
    if (year === null) return false;
    return Math.abs(year - row.year) <= 1;
  };

  // Una película tiene TRES títulos que nos pueden llegar, y hay que probar los
  // tres:
  //   `title`         traducción es-ES de TMDB  "El viaje de Chihiro"
  //   `originalTitle` idioma de rodaje          "千と千尋の神隠し"
  //   `englishTitle`  internacional en inglés   "Spirited Away"
  // Letterboxd exporta EL TERCERO (su catálogo es TMDB en-US). Comparar solo
  // contra los dos primeros —lo que hacía la PR #356— dejaba sin casar todo el
  // cine no anglosajón, incluido el español: "Pan's Labyrinth" no se parece ni a
  // "El laberinto del fauno" (title) ni a "El laberinto del fauno" (original).
  // `originalTitle`/`englishTitle` faltan en los resultados del catálogo local.
  const titleMatches = (candidate: ImportCandidate) =>
    [candidate.title, candidate.originalTitle, candidate.englishTitle].some(
      (title) => title != null && isSameTitle(title, row.title)
    );

  const localResults = await searchLocalCatalog(supabase, "movie", row.title);
  const localMatches = preferExactTitle(
    localResults.filter((r) => titleMatches(r) && sameYear(r.year)),
    row.title
  );
  if (localMatches.length === 1) {
    return { kind: "matched", catalogId: localMatches[0].catalogId! };
  }
  if (localMatches.length > 1) return ambiguous(localMatches);

  const apiResults = await searchMoviesForImport(row.title);
  const apiMatches = preferExactTitle(
    apiResults.filter((r) => titleMatches(r) && sameYear(r.year)),
    row.title
  );
  if (apiMatches.length === 1) {
    return {
      kind: "matched",
      catalogId: await catalogIdForMovieCandidate(supabase, apiMatches[0]),
    };
  }
  if (apiMatches.length > 1) return ambiguous(apiMatches);

  // Ningún título casó, pero TMDB SÍ devolvió resultados de ese año: la consulta
  // encontró la obra por un título alternativo que nosotros no pedimos
  // (reestreno, título regional, subtítulo…). Descartarla sería tirar un
  // candidato que muy probablemente es el bueno, así que se le enseña al usuario
  // en vez de mandarlo al formulario de alta manual. Sin año en el CSV no hay
  // nada que acote la lista y esto degeneraría en "aquí tienes 20 pelis": ahí sí
  // se declara sin match.
  if (row.year !== null) {
    const sameYearOnly = apiResults.filter((r) => sameYear(r.year));
    if (sameYearOnly.length > 0) return ambiguous(sameYearOnly);
  }

  return { kind: "unmatched" };
}

export async function matchImportRow(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  row: ImportRow
): Promise<ImportMatch> {
  if (itemType === "book") return matchBook(supabase, row);
  if (itemType === "movie") return matchMovie(supabase, row);
  return { kind: "unmatched" };
}
