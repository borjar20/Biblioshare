import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

function runtime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Una línea legible para una edición: "Bolsillo · DeBolsillo · 880 p".
export function formatEdition(edition: Edition, itemType: ItemType): string {
  const parts = [edition.label];
  if (edition.publisher) parts.push(edition.publisher);
  if (edition.totalUnits !== null) {
    parts.push(itemType === "movie" ? runtime(edition.totalUnits) : `${edition.totalUnits} p`);
  }
  return parts.join(" · ");
}

// Línea secundaria compacta para una tarjeta de versión de película: año y
// duración, sin repetir la etiqueta (que ya se pinta como badge aparte). Los
// libros siguen usando formatEdition, que sí antepone la etiqueta.
export function formatEditionMeta(edition: Edition): string {
  const parts: string[] = [];
  if (edition.year !== null) parts.push(String(edition.year));
  if (edition.totalUnits !== null) parts.push(runtime(edition.totalUnits));
  return parts.join(" · ");
}

// Línea completa de una tarjeta del EDITOR (`.mt` del frame 6): todo lo que
// se sabe de la edición — editorial, año, idioma, extensión, ISBN — sin
// repetir la etiqueta, que ya se pinta como pastilla encima.
export function formatEditionDetails(
  edition: Edition,
  itemType: ItemType,
  // El selector de edición (frame 7) pinta la editorial como NOMBRE de la
  // tarjeta, no en la línea de metadatos: ahí se pide sin ella.
  { withPublisher = true }: { withPublisher?: boolean } = {},
): string {
  const parts: string[] = [];
  if (withPublisher && edition.publisher) parts.push(edition.publisher);
  if (edition.year !== null) parts.push(String(edition.year));
  if (edition.language) parts.push(edition.language.toUpperCase());
  if (edition.totalUnits !== null) {
    parts.push(
      itemType === "movie"
        ? runtime(edition.totalUnits)
        : `${edition.totalUnits} p`,
    );
  }
  if (edition.isbn) parts.push(`ISBN ${edition.isbn}`);
  return parts.join(" · ");
}

// Precedencia de páginas del progreso (spec 2026-08-26 §5): manda la edición
// que el USUARIO identificó en su pase; sin ella, las páginas orientativas de
// la obra (`books.total_pages`). No hay tercer peldaño.
//
// La «edición primaria» (`book_editions.is_primary`) murió aquí. Nunca fue una
// decisión: la marcaba un trigger sobre la PRIMERA fila que entrara, y con el
// sync masivo vivo eso era literalmente la primera de hasta 500 filas bajadas
// de OpenLibrary. Hoy las ediciones solo existen cuando alguien identificó su
// tirada, así que el peldaño intermedio solo servía para que dos pantallas
// enseñaran totales distintos del mismo libro.
//
// El campo se llama `totalUnits` y no `totalPages` porque `Edition` es el tipo
// compartido con las versiones de película (allí son minutos): la regla es la
// misma y no se duplica por medio.
export function pagesForPass(
  passEdition: { totalUnits: number | null } | null | undefined,
  workTotalUnits: number | null | undefined,
): number | null {
  return passEdition?.totalUnits ?? workTotalUnits ?? null;
}
