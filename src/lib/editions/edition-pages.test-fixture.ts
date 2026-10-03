import type { createClient } from "@/lib/supabase/server";
import type { Edition } from "./types";
import type { Pass } from "@/lib/passes/types";

export const PAGE_USER = "page-fixture-owner";
export const PAGE_BOOK = "page-fixture-book";
export const PAGE_PASS = "page-fixture-pass";
export const PAGE_COLLECTION = "page-fixture-collection";

export type PageCase = {
  name: string;
  editionId: string | null;
  selectedPages: number | null;
  workPages: number | null;
  expectedPages: number | null;
  expectedPercent: number | null;
};

// Different totals deliberately distinguish choosing the pass edition from
// choosing the work or the first unrelated edition. At page 100 they mean
// 50%, 25% and 11% respectively; the expected values are fixture oracles.
export const PAGE_CASES: PageCase[] = [
  { name: "la edición elegida manda sobre la obra y otra edición anterior", editionId: "selected", selectedPages: 200, workPages: 400, expectedPages: 200, expectedPercent: 50 },
  { name: "sin edición elegida manda la obra aunque otra tenga páginas", editionId: null, selectedPages: 200, workPages: 400, expectedPages: 400, expectedPercent: 25 },
  { name: "la edición elegida sin páginas cae a la obra", editionId: "selected", selectedPages: null, workPages: 400, expectedPages: 400, expectedPercent: 25 },
  { name: "una edición elegida no resuelta cae a la obra", editionId: "missing", selectedPages: 200, workPages: 400, expectedPages: 400, expectedPercent: 25 },
  { name: "sin edición ni páginas de obra no usa las de una edición ajena", editionId: null, selectedPages: 200, workPages: null, expectedPages: null, expectedPercent: null },
  { name: "la edición elegida conserva sus páginas aunque la obra no tenga", editionId: "selected", selectedPages: 200, workPages: null, expectedPages: 200, expectedPercent: 50 },
];

type Row = Record<string, unknown>;
class ReadQuery {
  private columns: string[] = [];
  private filters: ((row: Row) => boolean)[] = [];
  private orders: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
  private bounds: [number, number] | null = null;
  private single = false;

  constructor(private readonly rows: Row[]) {}
  select(columns: string) { this.columns = columns.split(",").map((column) => column.trim()); return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending !== false, nullsFirst: options.nullsFirst === true });
    return this;
  }
  range(from: number, to: number) { this.bounds = [from, to]; return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve: (result: { data: Row[] | Row | null; error: null }) => unknown) {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    rows = [...rows].sort((left, right) => {
      for (const { column, ascending, nullsFirst } of this.orders) {
        const a = left[column]; const b = right[column];
        if (a == null && b == null) continue;
        if (a == null) return nullsFirst ? -1 : 1;
        if (b == null) return nullsFirst ? 1 : -1;
        const difference = typeof a === "number" && typeof b === "number"
          ? a - b : String(a).localeCompare(String(b));
        if (difference) return ascending ? difference : -difference;
      }
      return 0;
    });
    if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
    const projected = rows.map((row) => Object.fromEntries(this.columns.map((column) => [column, row[column]])));
    return Promise.resolve({ data: this.single ? projected[0] ?? null : projected, error: null }).then(resolve);
  }
}

// Dedicated test read boundary: no SDK, request session or network. The same
// pass/edition/catalog rows feed hydration, getActivePass and getEditions.
export function pageFixture(sample: PageCase) {
  const pass: Pass = {
    id: PAGE_PASS, status: "in_progress", isActive: true, position: { page: 100 },
    startedOn: "2026-10-01", finishedOn: null, rating: null, review: null,
    reviewIsSpoiler: false, isPublic: false, editionId: sample.editionId,
    pinnedOrder: null, droppedReason: null, droppedReasonNote: null,
  };
  const passRow = {
    id: pass.id, user_id: PAGE_USER, item_type: "book", item_id: PAGE_BOOK,
    status: pass.status, is_active: pass.isActive, position: pass.position,
    started_on: pass.startedOn, finished_on: pass.finishedOn, rating: pass.rating,
    review: pass.review, review_is_spoiler: false, is_public: false,
    edition_id: pass.editionId, pinned_order: null, dropped_reason: null, dropped_reason_note: null,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-03T00:00:00Z",
  };
  const editions: Edition[] = [
    { id: "unrelated", label: "Otra tirada", publisher: null, year: 2025, language: "es", totalUnits: 900, isbn: null, coverUrl: null },
    { id: "selected", label: "Mi tirada", publisher: null, year: 2024, language: "es", totalUnits: sample.selectedPages, isbn: null, coverUrl: null },
  ];
  const editionRows = editions.map((edition) => ({
    id: edition.id, book_id: PAGE_BOOK, label: edition.label, publisher: edition.publisher,
    published_year: edition.year, language: edition.language, total_pages: edition.totalUnits,
    isbn: edition.isbn, cover_url: edition.coverUrl,
  }));
  const tables = new Map<string, Row[]>([
    ["passes", [passRow]], ["pass_reviews", [passRow]], ["book_editions", editionRows],
    ["books", [{ id: PAGE_BOOK, title: "Libro de prueba", author: "Autora de prueba", cover_url: null,
      synopsis: "Ficha local", published_year: 2024, publisher: null, total_pages: sample.workPages,
      isbn: null, genres: [], openlibrary_work_key: null, google_books_volume_id: null,
      hydrated_at: "2026-10-01T00:00:00Z", repr_meta: null, wikidata_id: null }]],
    ["movies", []], ["series", []],
    ["collections", [{ id: PAGE_COLLECTION, user_id: PAGE_USER, name: "Colección local", description: null, is_sorteable: false }]],
    ["collection_items", [{ collection_id: PAGE_COLLECTION, item_type: "book", item_id: PAGE_BOOK, position: 0, added_at: "2026-10-01T00:00:00Z" }]],
  ]);
  const client = {
    from(table: string) {
      const rows = tables.get(table);
      if (!rows) throw new Error(`Unexpected page fixture table: ${table}`);
      return new ReadQuery(rows);
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>;
  return { client, pass, editions };
}
