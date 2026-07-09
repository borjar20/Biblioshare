import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { BookFormat } from "@/lib/library/position";

export type ImportFormat = "goodreads" | "letterboxd" | "bookmory";

export type ImportDiaryDate = {
  startedOn: string | null; // YYYY-MM-DD
  finishedOn: string; // YYYY-MM-DD
};

// Normalized shape produced by every format-specific parser — matching and
// commit logic (match-row.ts, commit-row.ts) work off this, never the raw
// CSV/XLSX row, so they stay format-agnostic.
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

export type ParsedImport = {
  format: ImportFormat;
  itemType: ItemType;
  rows: ImportRow[];
};

export type ImportRowOutcome = "imported" | "duplicate" | "unmatched" | "error";

export type ImportRowResult = {
  rowNumber: number;
  title: string;
  outcome: ImportRowOutcome;
  unknownStatus?: string;
  errorMessage?: string;
};
