import type { ImportFormat } from "./types";

// Goodreads y Letterboxd exportan CSV plano, y se distinguen por una columna de
// cabecera propia de cada uno. No hay selector de formato: lo decide el propio
// fichero que subes.
//
// Bookmory (.xlsx) se retiró el 2026-07-20 — era la única fuente que obligaba a
// leer hojas de cálculo, y con ella se fue la dependencia `exceljs`. Al quedar
// solo CSV, el envoltorio `FormatDetection` con su campo `kind` sobraba: la
// función devuelve directamente el formato.
export function detectFormat(buffer: ArrayBuffer): ImportFormat | null {
  const text = new TextDecoder("utf-8").decode(buffer);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";

  if (firstLine.includes("Letterboxd URI")) return "letterboxd";
  if (firstLine.includes("Exclusive Shelf") || firstLine.includes("ISBN13")) {
    return "goodreads";
  }
  return null;
}
