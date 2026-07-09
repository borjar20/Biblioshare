import * as XLSX from "xlsx";
import { normalizeIsbn } from "@/lib/catalog/isbn";
import type { ImportRow } from "./types";

// Only the two states seen in a real export are confirmed; the other two are
// best-effort guesses. Anything else (including these guesses, if wrong)
// falls back to "planned" via unknownStatusLabel rather than breaking the
// import — see docs/REQUIREMENTS.md §7.7.
const STATUS_MAP: Record<string, ImportRow["status"]> = {
  "¡Lo terminé de leer!": "completed",
  "Leer más tarde": "planned",
  "Leyendo actualmente": "in_progress",
  Abandonado: "dropped",
};

function cell(row: unknown[], index: number): string {
  if (index < 0) return "";
  const value = row[index];
  return value === undefined || value === null ? "" : String(value).trim();
}

function parsePages(raw: string): number | null {
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

// "7/7/2025" — D/M/AAAA.
function parseSpanishDate(raw: string): string | null {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// "7/7/2025 ~ 24/8/2025" (or a single date with no "~" for an in-progress read).
function parseReadingPeriod(
  raw: string
): { startedOn: string | null; finishedOn: string } | null {
  const parts = raw.split("~").map((p) => p.trim());
  const finishedRaw = parts.length > 1 ? parts[1] : parts[0];
  const finishedOn = finishedRaw ? parseSpanishDate(finishedRaw) : null;
  if (!finishedOn) return null;
  const startedOn = parts.length > 1 ? parseSpanishDate(parts[0]) : null;
  return { startedOn, finishedOn };
}

// 0-5 in 0.5 steps, same conversion as Goodreads/Letterboxd.
function parseRating(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 2) : null;
}

// Reads only the "Libros" sheet (or the first sheet, if renamed) — the
// per-book "Notas (Título)" sheets aren't imported in v1. Row 1 is a partial
// group-header row ("Información del libro", "Registro de lectura 1", …),
// row 2 is the real header, data starts at row 3.
export function parseBookmory(buffer: ArrayBuffer): ImportRow[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames.includes("Libros")
    ? "Libros"
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  const header = (grid[1] ?? []).map((h) => String(h).trim());
  const col = (name: string) => header.indexOf(name);

  const iTitle = col("Título");
  const iAuthor = col("Autores/as");
  const iPublisher = col("Editorial");
  const iIsbn = col("ISBN");
  const iPages = col("Total de páginas");
  const iStatus = col("Estado");
  const iPeriod = col("Período de lectura");
  const iRating = col("Calificaciones de estrellas");

  const rows: ImportRow[] = [];
  for (let r = 2; r < grid.length; r++) {
    const raw = grid[r];
    if (!raw) continue;

    const title = cell(raw, iTitle);
    if (!title) continue;

    const period = parseReadingPeriod(cell(raw, iPeriod));
    const rawStatus = cell(raw, iStatus);
    const mappedStatus = STATUS_MAP[rawStatus];

    rows.push({
      rowNumber: r + 1, // grid is 0-indexed; excel row = index + 1
      title,
      author: cell(raw, iAuthor) || null,
      isbn: normalizeIsbn(cell(raw, iIsbn)),
      publisher: cell(raw, iPublisher) || null,
      pageCount: parsePages(cell(raw, iPages)),
      year: null,
      status: mappedStatus ?? "planned",
      rating: parseRating(cell(raw, iRating)),
      bookFormat: null,
      diaryDates: period ? [period] : [],
      unknownStatusLabel: rawStatus && !mappedStatus ? rawStatus : null,
    });
  }

  return rows;
}
