import ExcelJS from "exceljs";
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

// A cell value in exceljs can be a primitive, a Date, or a wrapper object
// (rich text, hyperlink, or formula result). Flatten any of them to trimmed
// text so the parsing logic below stays value-shape-agnostic.
function cellText(row: ExcelJS.Row, index: number): string {
  if (index < 1) return "";
  const value = row.getCell(index).value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("text" in value && value.text != null) return String(value.text).trim();
    if ("result" in value && value.result != null) return String(value.result).trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join("").trim();
    }
    if ("hyperlink" in value && "text" in value) return String(value.text).trim();
  }
  return String(value).trim();
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
// row 2 is the real header, data starts at row 3. Async because exceljs
// parses the workbook asynchronously (unlike the old sync xlsx reader).
export async function parseBookmory(buffer: ArrayBuffer): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet =
    workbook.getWorksheet("Libros") ?? workbook.worksheets[0] ?? null;
  if (!sheet) return [];

  // Row 2 is the real header — map column name → 1-based column index.
  const headerIndex = new Map<string, number>();
  sheet.getRow(2).eachCell((cell, colNumber) => {
    const name = String(cell.value ?? "").trim();
    if (name) headerIndex.set(name, colNumber);
  });
  const col = (name: string) => headerIndex.get(name) ?? -1;

  const iTitle = col("Título");
  const iAuthor = col("Autores/as");
  const iPublisher = col("Editorial");
  const iIsbn = col("ISBN");
  const iPages = col("Total de páginas");
  const iStatus = col("Estado");
  const iPeriod = col("Período de lectura");
  const iRating = col("Calificaciones de estrellas");

  const rows: ImportRow[] = [];
  for (let r = 3; r <= sheet.rowCount; r++) {
    const raw = sheet.getRow(r);

    const title = cellText(raw, iTitle);
    if (!title) continue;

    const period = parseReadingPeriod(cellText(raw, iPeriod));
    const rawStatus = cellText(raw, iStatus);
    const mappedStatus = STATUS_MAP[rawStatus];

    rows.push({
      rowNumber: r, // exceljs rows are already 1-based (= excel row)
      title,
      author: cellText(raw, iAuthor) || null,
      isbn: normalizeIsbn(cellText(raw, iIsbn)),
      publisher: cellText(raw, iPublisher) || null,
      pageCount: parsePages(cellText(raw, iPages)),
      year: null,
      status: mappedStatus ?? "planned",
      rating: parseRating(cellText(raw, iRating)),
      bookFormat: null,
      diaryDates: period ? [period] : [],
      unknownStatusLabel: rawStatus && !mappedStatus ? rawStatus : null,
    });
  }

  return rows;
}
