import { createHash } from "node:crypto";
import Papa from "papaparse";
import { readCsvZip } from "./read-zip";
import type { ArchiveAnalysis, ArchiveMovie } from "./letterboxd-archive-types";

const SUPPORTED = ["watched.csv", "diary.csv", "reviews.csv", "ratings.csv", "watchlist.csv"];
type Row = Record<string, string>;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

function date(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw) throw new Error("invalidArchive");
  return raw;
}
function rating(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = Number(raw) * 2;
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new Error("invalidArchive");
  return value;
}

/** Pure preview: no catalog calls, session access, or personal data writes. */
export function analyzeLetterboxdArchive(input: Uint8Array): ArchiveAnalysis {
  const files = readCsvZip(input);
  const movies = new Map<string, ArchiveMovie>();
  const excludedFiles = [...files.keys()].filter((name) => !SUPPORTED.includes(name) && !name.endsWith("/"));
  const conflicts: ArchiveAnalysis["conflicts"] = [];
  const sourceRows = new Map<string, Row[]>();
  let total = 0;
  for (const name of SUPPORTED) {
    const csv = files.get(name);
    if (csv === undefined) continue;
    const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    if (parsed.errors.length || !["Name", "Year", "Letterboxd URI"].every((h) => parsed.meta.fields?.includes(h))) throw new Error("invalidArchive");
    total += parsed.data.length;
    if (total > 30000) throw new Error("archiveTooLarge");
    sourceRows.set(name, parsed.data);
  }
  function movie(row: Row): ArchiveMovie {
    const title = row.Name?.trim();
    const year = row.Year?.trim() ? Number(row.Year) : null;
    if (!title || title.length > 500 || (year !== null && (!Number.isInteger(year) || year < 1800 || year > 2200))) throw new Error("invalidArchive");
    // Letterboxd diary URIs identify log entries, whereas watched URIs identify
    // films. Title/year joins the files; log URIs below preserve separate passes.
    const key = hash(JSON.stringify([title.toLowerCase(), year]));
    let item = movies.get(key);
    if (!item) {
      item = { sourceKey: key, title, year, passes: [], planned: false };
      movies.set(key, item);
    }
    return item;
  }
  const occurrences = new Map<string, number>();
  for (const row of sourceRows.get("diary.csv") ?? []) {
    const item = movie(row);
    const finishedOn = date(row["Watched Date"]);
    const identity = row["Letterboxd URI"]?.trim();
    const fallback = `${item.sourceKey}:${finishedOn}`;
    const occurrence = (occurrences.get(fallback) ?? 0) + 1;
    occurrences.set(fallback, occurrence);
    const sourceKey = hash(`diary:${item.sourceKey}:${identity || `${finishedOn}:${occurrence}`}`);
    if (item.passes.some((p) => p.sourceKey === sourceKey)) continue;
    item.passes.push({ sourceKey, finishedOn, rating: rating(row.Rating), review: null });
  }
  for (const row of sourceRows.get("reviews.csv") ?? []) {
    const item = movie(row);
    const finishedOn = date(row["Watched Date"]);
    const review = row.Review?.trim();
    if (!review) continue;
    if (review.length > 100000) throw new Error("archiveTooLarge");
    const sourceKey = hash(`diary:${item.sourceKey}:${row["Letterboxd URI"] || finishedOn}`);
    const byIdentity = item.passes.filter((p) => p.sourceKey === sourceKey);
    const candidates = byIdentity;
    if (candidates.length === 1 && !candidates[0].review) {
      candidates[0].review = review;
      candidates[0].rating ??= rating(row.Rating);
    } else if (!candidates.length && finishedOn && row["Letterboxd URI"]?.trim()) {
      item.passes.push({ sourceKey, finishedOn, review, rating: rating(row.Rating) });
    } else {
      conflicts.push({ movieKey: item.sourceKey, sourceKey: hash(`review:${sourceKey}:${review}`), reason: "reviewAssociation", review, finishedOn, rating: rating(row.Rating) });
    }
  }
  for (const row of sourceRows.get("watched.csv") ?? []) {
    const item = movie(row);
    if (!item.passes.length) item.passes.push({ sourceKey: hash(`watched:${item.sourceKey}`), finishedOn: null, rating: null, review: null });
  }
  for (const row of sourceRows.get("ratings.csv") ?? []) {
    const item = movie(row);
    const value = rating(row.Rating);
    if (!item.passes.length) item.passes.push({ sourceKey: hash(`watched:${item.sourceKey}`), finishedOn: null, rating: null, review: null });
    const latest = [...item.passes].reverse().sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? ""))[0];
    if (value !== null) latest.rating = value;
  }
  for (const row of sourceRows.get("watchlist.csv") ?? []) movie(row).planned = true;
  const result: ArchiveAnalysis = {
    fingerprint: hash(input), movies: [...movies.values()], excludedFiles, conflicts,
    summary: { movies: movies.size, passes: 0, unknownDates: 0, planned: 0, reviews: 0, ratings: 0, conflicts: conflicts.length },
  };
  if (!movies.size) throw new Error("invalidArchive");
  for (const item of result.movies) {
    result.summary.passes += item.passes.length;
    result.summary.unknownDates += item.passes.filter((p) => !p.finishedOn).length;
    result.summary.ratings += item.passes.filter((p) => p.rating !== null).length;
    result.summary.reviews += item.passes.filter((p) => p.review !== null).length;
    result.summary.planned += Number(item.planned);
  }
  if (result.summary.movies > 3000 || result.summary.passes + result.summary.planned > 6000) throw new Error("archiveTooLarge");
  return result;
}
