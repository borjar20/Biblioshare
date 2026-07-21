import type { ItemType } from "@/lib/catalog/types";
import { comparePositions, type Position } from "@/lib/library/position";

export type SortableNote = { position: Position; createdAt: string };

// ¿Esta nota está anclada a algún sitio? Una posición vacía ({}) es lo que
// devuelve parsePosition cuando el jsonb no dice nada útil, y lo que tiene
// SIEMPRE una película.
function isAnchored(position: Position): boolean {
  if ("page" in position && position.page !== undefined) return true;
  if ("season" in position) return true;
  return false;
}

// Orden de "Mis notas y citas": primero lo anclado en orden de lectura —
// recorres la obra de principio a fin, que es de lo que trata releer— y después
// lo suelto por fecha descendente.
//
// La comparación de posiciones NO se reimplementa aquí: se delega en
// comparePositions (src/lib/library/position.ts), que ya sabe que T2E5 va
// después de T1E12 y está duplicada a propósito en SQL para los checkpoints de
// clubes. Una tercera copia sería la tercera verdad sobre lo mismo.
export function compareNotes(
  itemType: ItemType,
  a: SortableNote,
  b: SortableNote,
): number {
  const aAnchored = isAnchored(a.position);
  const bAnchored = isAnchored(b.position);

  if (aAnchored !== bAnchored) return aAnchored ? -1 : 1;

  if (aAnchored && bAnchored) {
    const byPosition = comparePositions(itemType, a.position, b.position);
    if (byPosition !== 0) return byPosition;
  }

  // Desempate (y orden único del grupo suelto): la más nueva primero.
  return b.createdAt.localeCompare(a.createdAt);
}
