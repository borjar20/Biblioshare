// Diff puro entre la membresía actual de una saga TMDB y las partes de la
// colección. Sustituye al delete+insert de populateTmdbCollection: en el
// modelo multi-saga (spec §1.2) la saga puede tener miembros manuales ajenos a
// TMDB y borrarlo todo se los llevaría por delante. Partes retiradas de la
// colección TMDB se quedan (aceptado en spec §7): no hay forma fiable de
// distinguirlas de un añadido manual.
//
// REVISIÓN 2026-07-26 (curación manual gana sobre el sync de TMDB): antes,
// una fila existente cuya `position` no coincidía con la deseada entraba en
// `toUpdate` y se mandaba a `sync_tmdb_saga_items`, que la pisaba — incluso
// si esa `position` (o ese `null`) era una decisión de un curador (p. ej.
// marcar una película como `placement=libre`, que exige `position=null`).
// Cualquier visitante que abriera la ficha (populateTmdbCollection corre en
// la lectura, no hace falta ser curador) revertía la curación sin avisar.
// Reproducido en dev antes de este cambio con «Matrix - Colección»: curar
// Matrix 1 como libre (position=null) y luego abrir la ficha volvía a dejar
// position=1, placement=fijo.
//
// Regla nueva: el sync SOLO rellena huecos. Una fila que ya existe en
// `saga_items` no se toca — ni aquí calculando qué mandar, ni en la RPC
// `sync_tmdb_saga_items` (arreglada en la misma migración, con
// `on conflict ... do nothing`, que es la barrera de verdad porque protege
// también a un cliente desplegado con esta lógica vieja). Por eso ya no
// existe `toUpdate`: no hay ninguna corrección legítima que este código deba
// pedir para una fila existente.
//
// Consecuencia asumida: si TMDB reordena una colección más adelante, ese
// reorden ya no se propaga a las filas existentes — ni siquiera a las que
// nunca tocó un humano, porque no hay forma fiable de distinguir "nunca
// curada" de "curada a propósito". Es el precio de que la curación manual
// gane, y es deliberado (ver también el comentario de la migración
// 20260726_saga_items_placement_writers_fix.sql).

export type CollectionSyncRow = { item_id: string; position: number | null };
export type DesiredPart = { itemId: string; position: number };
export type CollectionSyncPlan = {
  toInsert: DesiredPart[];
};

export function planCollectionSync(
  existing: CollectionSyncRow[],
  desired: DesiredPart[],
): CollectionSyncPlan {
  const existingIds = new Set(existing.map((r) => r.item_id));
  const toInsert = desired.filter((part) => !existingIds.has(part.itemId));
  return { toInsert };
}
