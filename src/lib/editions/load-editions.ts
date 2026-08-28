import { getEditions } from "./get-editions";
import type { Edition } from "./types";

// Solo tiradas IDENTIFICADAS (spec 2026-08-26 §1): elegidas en el picker,
// escaneadas por ISBN o creadas por un colaborador. El sync masivo desde OL
// murió con el spec de representación; las candidatas se consultan en vivo
// (fetchRepresentationCandidates, src/lib/catalog/openlibrary/editions.ts) y
// nunca se persisten.
export async function loadBookEditions(bookId: string): Promise<Edition[]> {
  return getEditions("book", bookId, true);
}
