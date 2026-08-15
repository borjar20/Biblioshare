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
  /** El curador decide si esta saga enseña su mapa (fase 3, Task 4-bis): el
   *  mapa se deriva de la curación, así que su existencia ya no es señal de
   *  que aporte — una saga de dos títulos lo tiene igual que Mundodisco. */
  showMap: boolean;
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
 *
 *  La unión se declaraba AQUÍ a mano, y el editor tenía además dos copias en
 *  forma de array: tres sitios donde escribir el mismo vocabulario y ninguno
 *  que obligara a que coincidieran. Desde la fase 5 hay una sola lista
 *  (`./roles`) y un test que la ata al enum de la BD. Se reexporta para no
 *  tocar los ~10 módulos que importan `SagaItemRole` desde `./types`. */
import type { SagaItemRole } from "./roles";

export { SAGA_ITEM_ROLES } from "./roles";
export type { SagaItemRole } from "./roles";

/** Dónde se lee un miembro. null = sin clasificar (deuda de curación).
 *  Espejo a mano de public.saga_placement, igual que SagaItemRole: si se añade
 *  un valor en BD, TypeScript NO se queja aquí. */
export type SagaPlacement = "fijo" | "libre" | "anclado";

/** Qué clase de tándem es un hueco compartido (`saga_tandems.modo`, fase 2):
 *  `simultaneo` = «a la vez»; `indistinto` = «cualquier orden». Espejo a mano de
 *  public.saga_tandem_mode, igual que los dos de arriba.
 *
 *  Ojo con el alcance: esto describe el HUECO, no a sus obras. La pertenencia al
 *  tándem sigue siendo el empate de `position` en `saga_items`, y esa es su
 *  única fuente de verdad. */
export type TandemMode = "simultaneo" | "indistinto";

/** Por qué existe el tramo de una ventana recomendada. Espejo de
 *  `public.saga_window_reason` (fase 3). Nullable en BD y aquí: las 4 ventanas
 *  curadas antes de esta fase no lo declararon y nadie decidió por ellas, así
 *  que no hubo backfill — el mismo criterio con que `TandemMode` puede faltar. */
export type WindowReason = "spoiler" | "contexto";

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
  /** Dónde se lee. `fijo` ⇔ position !== null (CHECK saga_items_placement_position,
   *  un CASE). `anclado` = position null, colocado por ventana relativa y
   *  OBLIGATORIO. `libre` = cuando quieras. null = sin clasificar. */
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
  /** El lector ha decidido saltarse esta obra (`saga_optional_skips`, fase 4).
   *  SOLO VISUAL: tacha y atenúa la fila, y el denominador del progreso NO se
   *  mueve — lo gobierna `countedKeys` (./progress.ts) desde
   *  `saga_items.optional`, que esta feature no toca. Es el límite duro de la
   *  spec 2026-07-28.
   *
   *  `false` sin sesión, y `false` también para una obra que no es opcional:
   *  nada impide que sobreviva el salto de una obra que dejó de serlo, y el
   *  criterio manda al LEER, no al guardar. */
  skipped: boolean;
};

/** Ventana de una entrada `libre` ya resuelta para la ficha. Un ancla que no
 *  resuelve contra el subárbol cargado llega como `null` y no se pinta: mejor
 *  media frase cierta que una referencia rota (spec fase 2b).
 *  Las claves viajan junto a los títulos porque el mapa (fase 3) dibuja cada
 *  ancla como una ARISTA, y para eso necesita el extremo, no su nombre. */
export type ResolvedWindow = {
  afterTitle: string | null;
  beforeTitle: string | null;
  afterKey: string | null;
  beforeKey: string | null;
  /** Motivo declarado de la ventana (fase 3), o null. A diferencia de las
   *  anclas, NO puede «romperse»: no apunta a nada que pueda desaparecer, así
   *  que sobrevive a que un ancla deje de resolver. */
  reason: WindowReason | null;
};

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
