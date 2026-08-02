// Tamaños del CDN de portadas de OpenLibrary: S (miniatura), M (listados de
// búsqueda), L (ficha/detalle, más resolución).
export function buildCoverUrl(
  coverId?: number | null,
  size: "S" | "M" | "L" = "M"
): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;
}

// Todas las portadas de una obra (JSON `covers: number[]`), en tamaño L para la
// ficha. OpenLibrary marca "sin portada" con -1, así que se filtran los <= 0.
export function mapWorkCovers(covers?: number[] | null): string[] {
  return (covers ?? [])
    .filter((id) => id > 0)
    .map((id) => buildCoverUrl(id, "L"))
    .filter((url): url is string => url !== null);
}
