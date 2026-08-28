import type { SearchResult } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { BookFormat } from "@/lib/library/position";

export type ImportFormat = "goodreads" | "letterboxd";

export type ImportDiaryDate = {
  startedOn: string | null; // YYYY-MM-DD
  finishedOn: string; // YYYY-MM-DD
};

// Normalized shape produced by every format-specific parser — matching and
// commit logic (match-row.ts, commit-row.ts) work off this, never the raw
// CSV row, so they stay format-agnostic.
export type ImportRow = {
  rowNumber: number; // 1-based source row, for user-facing reporting
  title: string;
  author: string | null; // book only
  isbn: string | null; // book only, normalized
  publisher: string | null; // book only
  pageCount: number | null; // book only
  year: number | null; // movie only, used to disambiguate title matches
  status: MediaStatus;
  rating: number | null; // already converted to the internal 1-10 scale
  bookFormat: BookFormat | null; // book only, best-effort from Binding
  diaryDates: ImportDiaryDate[]; // 0..n diary_entries to create
  // Set when the source status label didn't map to a known MediaStatus and
  // fell back to "planned" — surfaced in the results screen for review.
  unknownStatusLabel: string | null;
};

export type ImportRowOutcome =
  | "imported"
  | "duplicate"
  | "unmatched"
  // Hay más de una obra que encaja con la fila y el matcher NO desempata solo:
  // "The Visit (2015)" son tres películas distintas en TMDB. Antes se cogía la
  // primera a ciegas; ahora la elige el usuario en la pantalla de triaje.
  | "ambiguous"
  | "error";

// Un candidato que se le ofrece al usuario para desempatar. Es un `SearchResult`
// tal cual: lo mismo que `/buscar` manda de vuelta al servidor en addToLibrary,
// así que `findOrCreateCatalogItem` lo consume sin traducción.
export type ImportCandidate = SearchResult;

export type ImportRowResult = {
  rowNumber: number;
  title: string;
  outcome: ImportRowOutcome;
  unknownStatus?: string;
  errorMessage?: string;
  /** Obra de catálogo contra la que se escribió (outcome "imported"/"duplicate").
   *  Lo necesita quien invalida la caché al terminar la tanda: la nota
   *  importada no se ve hasta que se invalida `ratings:<tipo>:<id>` (#718). */
  itemId?: string;
  // Solo en outcome "ambiguous".
  candidates?: ImportCandidate[];
};

// Lo que devuelve el matcher. Tres desenlaces, no dos: además de acertar o no
// acertar, puede acertar DEMASIADO (varias obras válidas) y ceder la decisión.
export type ImportMatch =
  | {
      kind: "matched";
      catalogId: string;
      // Presente SOLO cuando la fila casó por ISBN (local o vía lookupIsbn):
      // es la identificación deliberada de una tirada concreta que
      // commit-row.ts usa para resolver `book_editions.id` y clavarlo en el
      // pase. Un match por título nunca lo trae — no identifica tirada
      // ninguna (ver el comentario de `matchedIsbn` en find-or-create.ts).
      matchedIsbn?: string;
    }
  | { kind: "ambiguous"; candidates: ImportCandidate[] }
  | { kind: "unmatched" };
