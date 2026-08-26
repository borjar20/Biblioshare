// Serialización de celdas del CSV de exportación (`/api/export`).
//
// Dos reglas, y la segunda no es cosmética:
//
// 1. RFC 4180: entrecomilla si hay coma, comilla, salto de línea o punto y coma
//    (este último es el separador interno de la columna de fechas de diario).
// 2. Neutralización de fórmulas (issue #681): Excel, LibreOffice y Sheets
//    interpretan como FÓRMULA toda celda que empiece por `= + - @`, tabulador o
//    retorno de carro, aunque venga entrecomillada. El CSV lleva texto que
//    escribe el usuario (notas) y texto del catálogo global (título, autor), así
//    que una obra titulada `=HYPERLINK("http://malo","pulsa")` ejecutaría código
//    en la hoja de quien la exporte. Se prefija un apóstrofo, que es el marcador
//    de «esto es texto» de las hojas de cálculo.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  // Los números se serializan tal cual: `String(n)` no puede producir una
  // fórmula (un `-5` es un número negativo para la hoja, no una expresión), y
  // prefijarlos rompería la columna de notas y la de relecturas para quien
  // luego quiera sumarlas.
  if (typeof value === "number") return String(value);

  const cell = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  if (/[",\n;]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}
