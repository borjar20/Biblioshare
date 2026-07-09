import Papa from "papaparse";
import { normalizeIsbn } from "@/lib/catalog/isbn";
import type { BookFormat } from "@/lib/library/position";
import type { ImportRow } from "./types";

const BINDING_TO_FORMAT: Record<string, BookFormat> = {
  Paperback: "paperback",
  "Mass Market Paperback": "paperback",
  Softcover: "softcover",
  Hardcover: "hardcover",
};

// Goodreads wraps ISBN columns as ="12345" so Excel doesn't drop leading
// zeros / treat them as numbers.
function stripExcelFormula(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^="?(.*?)"?$/);
  return (match ? match[1] : trimmed).trim();
}

// Goodreads "Date Read" is YYYY/MM/DD.
function parseGoodreadsDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function mapStatus(shelf: string): ImportRow["status"] {
  switch (shelf.trim().toLowerCase()) {
    case "read":
      return "completed";
    case "currently-reading":
      return "in_progress";
    default:
      return "planned";
  }
}

export function parseGoodreads(csvText: string): ImportRow[] {
  const { data } = Papa.parse<Record<string, string | undefined>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const rows: ImportRow[] = [];
  data.forEach((raw, index) => {
    const title = (raw["Title"] ?? "").trim();
    if (!title) return;

    const isbn13 = normalizeIsbn(stripExcelFormula(raw["ISBN13"] ?? ""));
    const isbn10 = normalizeIsbn(stripExcelFormula(raw["ISBN"] ?? ""));
    const myRating = Number((raw["My Rating"] ?? "0").trim());
    const finishedOn = parseGoodreadsDate(raw["Date Read"] ?? "");
    const binding = (raw["Binding"] ?? "").trim();
    const pageCount = Number((raw["Number of Pages"] ?? "").trim());

    rows.push({
      rowNumber: index + 2, // header is row 1
      title,
      author: (raw["Author"] ?? "").trim() || null,
      isbn: isbn13 ?? isbn10,
      publisher: (raw["Publisher"] ?? "").trim() || null,
      pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null,
      year: null,
      status: mapStatus(raw["Exclusive Shelf"] ?? ""),
      rating: Number.isFinite(myRating) && myRating > 0 ? myRating * 2 : null,
      bookFormat: BINDING_TO_FORMAT[binding] ?? null,
      diaryDates: finishedOn ? [{ startedOn: null, finishedOn }] : [],
      unknownStatusLabel: null,
    });
  });

  return rows;
}
