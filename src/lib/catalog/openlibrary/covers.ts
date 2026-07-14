// Tamaños del CDN de portadas de OpenLibrary: S (miniatura), M (listados de
// búsqueda), L (ficha/detalle, más resolución).
export function buildCoverUrl(
  coverId?: number | null,
  size: "S" | "M" | "L" = "M"
): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}
