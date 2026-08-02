import type { createClient } from "@/lib/supabase/server";
import { findLocalBookByIsbn, searchLocalCatalog } from "@/lib/catalog/local-search";
import { searchWorks } from "@/lib/catalog/openlibrary/work-search";
import { lookupIsbn } from "@/lib/catalog/openlibrary/isbn-lookup";
import { searchMovies } from "@/lib/catalog/tmdb";
import { findOrCreateCatalogItem } from "@/lib/catalog/find-or-create";
import { isSameTitle } from "@/lib/catalog/title-match";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Local catalog hits already carry a catalogId (see local-search.ts); API
// hits need findOrCreateCatalogItem to persist them first (same pattern as
// the interactive search flow, src/lib/catalog/search.ts).
async function matchBook(
  supabase: SupabaseServerClient,
  row: ImportRow
): Promise<string | null> {
  if (row.isbn) {
    const local = await findLocalBookByIsbn(supabase, row.isbn);
    if (local) return local.catalogId!;

    // An ISBN precisely identifies the edition — trust Open Library's
    // ISBN-scoped result directly, even when its canonical title differs
    // from the CSV's shorthand title (e.g. "Nineteen Eighty-Four" vs
    // "1984"). No title check here (same as the interactive search flow).
    // El lookup devuelve la OBRA (con matchedIsbn anotado); sus ediciones las
    // traerá ensureBookEditions cuando alguien abra la ficha.
    const found = await lookupIsbn(row.isbn);
    if (found) return findOrCreateCatalogItem(supabase, found);
  }

  const localTitleResults = await searchLocalCatalog(supabase, "book", row.title);
  const localTitleMatch = localTitleResults.find((r) => isSameTitle(r.title, row.title));
  if (localTitleMatch) return localTitleMatch.catalogId!;

  const apiTitleResults = await searchWorks(row.title);
  const apiTitleMatch = apiTitleResults.find((r) => isSameTitle(r.title, row.title));
  if (apiTitleMatch) return findOrCreateCatalogItem(supabase, apiTitleMatch);

  return null;
}

async function matchMovie(
  supabase: SupabaseServerClient,
  row: ImportRow
): Promise<string | null> {
  // A candidate with no release year can't be verified against the CSV's
  // year, so it's only accepted when the CSV itself has no year either —
  // otherwise an obscure/junk entry with a blank release date would bypass
  // the year check entirely.
  const sameYear = (year: number | null) => {
    if (row.year === null) return true;
    if (year === null) return false;
    return Math.abs(year - row.year) <= 1;
  };

  // TMDB devuelve `title` traducido a es-ES; Letterboxd exporta el título
  // ORIGINAL ("Cadena perpetua" vs "The Shawshank Redemption"). Se acepta el
  // candidato si coincide cualquiera de los dos títulos. `originalTitle` es
  // undefined en resultados locales y ahí solo cuenta `title`.
  const titleMatches = (candidate: { title: string; originalTitle?: string | null }) =>
    isSameTitle(candidate.title, row.title) ||
    (candidate.originalTitle != null && isSameTitle(candidate.originalTitle, row.title));

  const localResults = await searchLocalCatalog(supabase, "movie", row.title);
  const localMatch = localResults.find((r) => titleMatches(r) && sameYear(r.year));
  if (localMatch) return localMatch.catalogId!;

  const apiResults = await searchMovies(row.title);
  const apiMatch = apiResults.find((r) => titleMatches(r) && sameYear(r.year));
  if (apiMatch) return findOrCreateCatalogItem(supabase, apiMatch);

  return null;
}

export async function matchImportRow(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  row: ImportRow
): Promise<string | null> {
  if (itemType === "book") return matchBook(supabase, row);
  if (itemType === "movie") return matchMovie(supabase, row);
  return null;
}
