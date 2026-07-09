import type { ImportFormat } from "./types";

export type FormatDetection = {
  format: ImportFormat;
  kind: "csv" | "xlsx";
};

// Bookmory exports .xlsx (a zip archive, "PK" signature); Goodreads/Letterboxd
// export plain CSV, distinguished by a header column unique to each. No
// user-facing format picker — the upload itself decides.
export function detectFormat(buffer: ArrayBuffer): FormatDetection | null {
  const bytes = new Uint8Array(buffer.slice(0, 2));
  if (bytes.length === 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return { format: "bookmory", kind: "xlsx" };
  }

  const text = new TextDecoder("utf-8").decode(buffer);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("Letterboxd URI")) {
    return { format: "letterboxd", kind: "csv" };
  }
  if (firstLine.includes("Exclusive Shelf") || firstLine.includes("ISBN13")) {
    return { format: "goodreads", kind: "csv" };
  }
  return null;
}
