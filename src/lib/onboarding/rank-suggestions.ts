import type { ItemType } from "@/lib/catalog/types";

// Orden de la rejilla del paso 2 (spec 2026-07-20 §4.2). Puro y aparte de la
// consulta para poder probarlo sin BD.
//
// El filtro de portada+año no es cosmético: con ~165 obras en catálogo, casi
// todas sembradas por nosotros, es lo único que separa una rejilla digna de un
// muro de placeholders.

export type SuggestionCandidate = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  year: number | null;
  /** Nº de usuarios distintos con un pase de esta obra (visibles por RLS). */
  readers: number;
};

const DEFAULT_LIMIT = 12;

export function rankSuggestions(
  candidates: SuggestionCandidate[],
  interests: ItemType[],
  limit: number = DEFAULT_LIMIT,
): SuggestionCandidate[] {
  // Sin intereses declarados se ofrecen los tres tipos: "no respondió" nunca
  // debe leerse como "no le interesa nada".
  const wanted = interests.length > 0 ? new Set(interests) : null;

  return candidates
    .filter((x) => x.coverUrl !== null && x.year !== null)
    .filter((x) => wanted === null || wanted.has(x.itemType))
    .sort((a, b) => {
      if (a.readers !== b.readers) return b.readers - a.readers;
      // Desempate por título: con pocos datos casi todo empata a 0 lectores, y
      // sin esto el orden lo decidiría Postgres y bailaría entre recargas.
      return a.title.localeCompare(b.title, "es");
    })
    .slice(0, limit);
}
