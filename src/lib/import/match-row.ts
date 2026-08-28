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
  row: ImportRow,
  userId?: string | null
): Promise<ImportMatch> {
  if (row.isbn) {
    const local = await findLocalBookByIsbn(supabase, row.isbn);
    // `local.matchedIsbn` siempre está poblado aquí (findLocalBookByIsbn lo
    // anota con el propio ISBN buscado): la edición YA existe en
    // `book_editions` con ese `(book_id, isbn)` — no hace falta userId para
    // encontrarla, solo para registrar una NUEVA (rama de abajo).
    if (local) return { kind: "matched", catalogId: local.catalogId!, matchedIsbn: local.matchedIsbn };

    // An ISBN precisely identifies the edition — trust Open Library's
    // ISBN-scoped result directly, even when its canonical title differs
    // from the CSV's shorthand title (e.g. "Nineteen Eighty-Four" vs
    // "1984"). No title check here (same as the interactive search flow).
    // El lookup devuelve la OBRA (con matchedIsbn anotado); findOrCreateCatalogItem
    // registra esa tirada como edición identificada (ensureBookEdition) — ya no
    // hay sync masivo que traiga el resto al abrir la ficha. userId viene de la
    // sesión de importación (commitImportRow); sin él, ensureBookEdition no
    // registra nada (register_book_edition exige auth.uid()).
    const found = await lookupIsbn(row.isbn);
    if (found) {
      return {
        kind: "matched",
        catalogId: await findOrCreateCatalogItem(supabase, found, userId),
        matchedIsbn: found.matchedIsbn,
      };
    }
  }

  const localTitleResults = await searchLocalCatalog(supabase, "book", row.title);
  const localTitleMatch = localTitleResults.find((r) => isSameTitle(r.title, row.title));
  if (localTitleMatch) return { kind: "matched", catalogId: localTitleMatch.catalogId! };

  // Un libro tiene hasta TRES títulos que nos pueden llegar: el del work de
  // Open Library —que es arbitrario: OL36410330W se llama «Fatta Eld»— y los
  // de sus mejores ediciones en español y en inglés. Comparar solo contra el
  // mostrado dejaba sin casar toda fila española cuyo work esté titulado en
  // otro idioma. Mismo patrón que `matchMovie` con sus tres títulos.
  const apiTitleResults = await searchWorks(row.title);
  const apiTitleMatch = apiTitleResults.find((r) =>
    [r.title, ...(r.altTitles ?? [])].some((title) => isSameTitle(title, row.title))
  );
  if (apiTitleMatch) {
    // Match por título, sin ISBN: no hay tirada identificada (matchedIsbn
    // ausente), así que findOrCreateCatalogItem no registra ninguna edición
    // aunque se le pase userId — es inofensivo pasarlo por consistencia.
    return {
      kind: "matched",
      catalogId: await findOrCreateCatalogItem(supabase, apiTitleMatch, userId),
    };
  }

  return { kind: "unmatched" };
}

function ambiguous(candidates: ImportCandidate[]): ImportMatch {
  return { kind: "ambiguous", candidates: candidates.slice(0, MAX_CANDIDATES) };
}

/**
 * El id de catálogo de un candidato elegido (por el matcher o por el usuario).
 *
 * Si ya está cacheado, su id y punto. Si no, se pide su ficha EN ESPAÑOL por id
 * antes de darlo de alta: los candidatos del importador vienen de una búsqueda
 * en-US (ver `searchMoviesForImport`) y guardarlos tal cual dejaría "Parasite"
 * en un catálogo que en todas partes dice "Parásitos". Es una llamada por
 * película nueva, no por fila.
 */
export async function catalogIdForMovieCandidate(
  supabase: SupabaseServerClient,
  candidate: ImportCandidate,
  userId?: string | null
): Promise<string> {
  if (candidate.catalogId) return candidate.catalogId;

  const tmdbId = Number(candidate.externalId);
  const spanish = Number.isFinite(tmdbId) ? await getMovieAsSearchResult(tmdbId) : null;
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
  //   `title`         el del catálogo local, en es-ES  "El viaje de Chihiro"
  //   `originalTitle` idioma de rodaje                 "千と千尋の神隠し"
  //   `englishTitle`  internacional en inglés          "Spirited Away"
  // Letterboxd exporta EL TERCERO (su catálogo es TMDB en-US). Comparar solo
  // contra los dos primeros —lo que hacía la PR #356— dejaba sin casar todo el
  // cine no anglosajón, incluido el español: "Pan's Labyrinth" no se parece ni a
  // "El laberinto del fauno" (title) ni a "El laberinto del fauno" (original).
  // En los candidatos de TMDB `title` viene también en inglés (se piden en-US) y
  // en los del catálogo local faltan los otros dos: por eso se prueban los tres
  // en todos, sin distinguir de dónde vino cada uno.
  const titleMatches = (candidate: ImportCandidate) =>
    [candidate.title, candidate.originalTitle, candidate.englishTitle].some(
      (title) => title != null && isSameTitle(title, row.title)
    );

  // El catálogo local NO puede decidir por su cuenta, y por eso ya no hay atajo
  // "si casa en local, ni preguntamos a TMDB": lo único que sabe es lo que
  // tenemos cacheado, y «hay una sola película con este nombre en NUESTRA base»
  // no es «hay una sola película con este nombre». Con el atajo, a quien ya
  // tuviera "La visita" (2015) cacheada se le seguía colando el match a ciegas
  // que esta PR arregla — lo destapó el e2e, no el razonamiento.
  //
  // Se consultan las dos fuentes y se decide sobre el conjunto: TMDB aporta los
  // tres títulos, el catálogo local aporta el `catalogId` de lo que ya está
  // dado de alta (fusionado por tmdb_id, para no pedir su ficha otra vez).
  const [localResults, apiResults] = await Promise.all([
    searchLocalCatalog(supabase, "movie", row.title),
    searchMoviesForImport(row.title),
  ]);

  const cachedByTmdbId = new Map(
    localResults.filter((r) => r.externalId).map((r) => [r.externalId, r])
  );
  const apiIds = new Set(apiResults.map((r) => r.externalId));
  const candidates: ImportCandidate[] = [
    ...apiResults.map((r) => {
      const cached = cachedByTmdbId.get(r.externalId);
      return cached ? { ...r, catalogId: cached.catalogId } : r;
    }),
    // Lo que tenemos cacheado y TMDB no ha devuelto: altas manuales sin tmdb_id,
    // o películas que se quedaron fuera de la primera página de resultados.
    ...localResults.filter((r) => !r.externalId || !apiIds.has(r.externalId)),
  ];

  const matches = preferExactTitle(
    candidates.filter((r) => titleMatches(r) && sameYear(r.year)),
    row.title
  );
  if (matches.length === 1) {
    return {
      kind: "matched",
      catalogId: await catalogIdForMovieCandidate(supabase, matches[0]),
    };
  }
  if (matches.length > 1) return ambiguous(matches);

  // Ningún título casó, pero TMDB SÍ devolvió resultados de ese año: la consulta
  // encontró la obra por un título alternativo que nosotros no pedimos
  // (reestreno, título regional, subtítulo…). Descartarla sería tirar un
  // candidato que muy probablemente es el bueno, así que se le enseña al usuario
  // en vez de mandarlo al formulario de alta manual. Sin año en el CSV no hay
  // nada que acote la lista y esto degeneraría en "aquí tienes 20 pelis": ahí sí
  // se declara sin match.
  if (row.year !== null) {
    const sameYearOnly = candidates.filter((r) => sameYear(r.year));
    if (sameYearOnly.length > 0) return ambiguous(sameYearOnly);
  }

  return { kind: "unmatched" };
}

export async function matchImportRow(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  row: ImportRow,
  userId?: string | null
): Promise<ImportMatch> {
  if (itemType === "book") return matchBook(supabase, row, userId);
  if (itemType === "movie") return matchMovie(supabase, row);
  return { kind: "unmatched" };
}
