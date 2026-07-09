import Papa from "papaparse";
import type { ImportRow } from "./types";

function parseYear(raw: string): number | null {
  const year = Number(raw.trim());
  return Number.isInteger(year) && year > 0 ? year : null;
}

// Letterboxd rating is 0.5-5 in half-star steps — the same *2 conversion as
// Goodreads' 0-5 stars lands both on the internal 1-10 integer scale.
function parseRating(raw: string): number | null {
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? Math.round(value * 2) : null;
}

// Expects the "diary.csv" export specifically (not watched.csv/ratings.csv) —
// it's the only one with a per-watch date, needed for diary_entries and to
// pick up rewatches (each rewatch is its own row).
export function parseLetterboxd(csvText: string): ImportRow[] {
  const { data } = Papa.parse<Record<string, string | undefined>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const rows: ImportRow[] = [];
  data.forEach((raw, index) => {
    const title = (raw["Name"] ?? "").trim();
    const watchedOn = (raw["Watched Date"] ?? raw["Date"] ?? "").trim();
    if (!title || !watchedOn) return;

    rows.push({
      rowNumber: index + 2,
      title,
      author: null,
      isbn: null,
      publisher: null,
      pageCount: null,
      year: parseYear(raw["Year"] ?? ""),
      status: "completed",
      rating: parseRating(raw["Rating"] ?? ""),
      bookFormat: null,
      diaryDates: [{ startedOn: null, finishedOn: watchedOn }],
      unknownStatusLabel: null,
    });
  });

  return rows;
}
