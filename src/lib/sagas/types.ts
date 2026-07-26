import type { ItemType } from "@/lib/catalog/types";

export type Saga = {
  id: string;
  name: string;
  overview: string | null;
  coverUrl: string | null;
  source: string; // "tmdb" | "manual"
  tmdbCollectionId: number | null;
  parentSagaId: string | null;
  accentColor: string | null;
};

// Pertenencia de un ítem a una saga.
export type SagaMembership = {
  sagaId: string;
  name: string;
  position: number | null;
  /** Obras que tiene la saga, para el "nº 4 de 20" de la ficha. */
  total: number;
  isPrimary: boolean;
};

/** Rol narrativo de un miembro dentro de una saga concreta (issue #167).
 *  Espejo a mano de public.saga_item_role: si algún día se añade un valor en
 *  BD, TypeScript NO se quejará aquí — hay que actualizarlo a mano. */
export type SagaItemRole = "precuela" | "spin_off" | "relato" | "paralela";

/** Dónde se lee un miembro. null = sin clasificar (deuda de curación).
 *  Espejo a mano de public.saga_placement, igual que SagaItemRole: si se añade
 *  un valor en BD, TypeScript NO se queja aquí. */
export type SagaPlacement = "fijo" | "libre";

// Miembro de una saga (para la vista de saga).
export type SagaMember = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  href: string;
  position: number | null;
  /** null = sin clasificar. Ortogonal a `position`: `position` dice si la obra
   *  tiene hueco fijo en el orden, `role` dice qué es. */
  role: SagaItemRole | null;
  /** Dónde se lee. `fijo` ⇔ position !== null — lo garantiza el CHECK
   *  saga_items_placement_position, que es un CASE (no un OR de tres ramas):
   *  con `placement IS NULL` un OR de tres ramas da NULL, no FALSE, y un CHECK
   *  solo rechaza FALSE (bug real, corregido en el review final de la rama,
   *  2026-07-26 — ver comentario en la migración). null = sin clasificar. */
  placement: SagaPlacement | null;
  /** true = NO cuenta en el denominador del progreso. Ortogonal a placement:
   *  una obra puede ser libre y contar, o fija y no contar. */
  optional: boolean;
};

export type MemberStatus = "completed" | "in_progress" | null;

// Miembro resuelto para la ficha: SagaMember + estado del usuario + subsaga
// (hija directa bajo la que milita; null = miembro directo / nexo).
export type DetailMember = SagaMember & {
  status: MemberStatus;
  /** Grupo VISUAL bajo el que se pinta en la ficha: hija DIRECTA del root
   *  (get-saga-detail.ts sube por la cadena de padres con `directChildFor`
   *  hasta profundidad 1), o null para miembro directo del root. Para un
   *  descendiente de profundidad >= 2 NO coincide con la saga dueña de la
   *  fila real de `saga_items` — para eso usa `ownerSagaId`, no este campo. */
  groupSagaId: string | null;
  /** saga_id REAL de la fila de `saga_items` que guarda esta membresía (el
   *  valor correcto para el WHERE saga_id = ... de un UPDATE/DELETE contra esa
   *  fila). Distinto de `groupSagaId` (agrupación visual, arriba): coinciden
   *  solo en profundidad 0 y 1; a partir de profundidad 2 divergen. */
  ownerSagaId: string;
  /** Año de publicación/estreno (books.published_year / movies|series.release_year); para el orden «Publicación». */
  year: number | null;
};

/** Ventana de una entrada `libre` ya resuelta a texto para la ficha. Un ancla
 *  que no resuelve contra el subárbol cargado llega como `null` y no se pinta:
 *  mejor media frase cierta que una referencia rota (spec fase 2b). */
export type ResolvedWindow = { afterTitle: string | null; beforeTitle: string | null };

export type SagaChildRef = {
  id: string;
  name: string;
  accentColor: string | null;
  /** Colocación del bloque en su padre (sagas.position_in_parent). */
  positionInParent: number | null;
  /** Colocación del bloque en su padre (sagas.placement_in_parent). null = sin
   *  clasificar, y entonces el bloque cae en la zona 3 del editor del padre. */
  placementInParent: SagaPlacement | null;
  /** true = el bloque entero sale del denominador del PADRE, no del suyo. */
  optionalInParent: boolean;
};
