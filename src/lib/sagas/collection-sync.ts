// Diff puro entre la membresía actual de una saga TMDB y las partes de la
// colección. Sustituye al delete+insert de populateTmdbCollection: en el
// modelo multi-saga (spec §1.2) la saga puede tener miembros manuales ajenos a
// TMDB y borrarlo todo se los llevaría por delante. Partes retiradas de la
// colección TMDB se quedan (aceptado en spec §7): no hay forma fiable de
// distinguirlas de un añadido manual.

export type CollectionSyncRow = { item_id: string; position: number | null };
export type DesiredPart = { itemId: string; position: number };
export type CollectionSyncPlan = {
  toInsert: DesiredPart[];
  toUpdate: DesiredPart[];
};

export function planCollectionSync(
  existing: CollectionSyncRow[],
  desired: DesiredPart[],
): CollectionSyncPlan {
  const byId = new Map(existing.map((r) => [r.item_id, r.position]));
  const toInsert: DesiredPart[] = [];
  const toUpdate: DesiredPart[] = [];
  for (const part of desired) {
    if (!byId.has(part.itemId)) toInsert.push(part);
    else if (byId.get(part.itemId) !== part.position) toUpdate.push(part);
  }
  return { toInsert, toUpdate };
}
