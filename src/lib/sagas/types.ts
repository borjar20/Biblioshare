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

export type SagaChildRef = {
  id: string;
  name: string;
  accentColor: string | null;
};
