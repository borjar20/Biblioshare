/** Vocabulario de roles narrativos (issue #167, ampliado en la fase 5 del
 *  timeline con los cuatro estados).
 *
 *  UNA lista, no tres: hasta esta fase el mismo vocabulario estaba escrito en la
 *  unión de `types.ts` y en dos arrays `ROLES` idénticos del editor de secuencia
 *  (`sequence-row.tsx`, `row-sheet.tsx`), sin nada que obligara a mantenerlos
 *  iguales. `roles.test.ts` ata esta lista al enum de la BD —vía el espejo
 *  generado `database.types.ts`— y a las tres tandas de traducciones.
 *
 *  El orden es el de LECTURA, el que el editor ofrece de arriba abajo: no el
 *  alfabético ni el histórico del enum. Nada ordena datos por él.
 *
 *  Dos ausencias deliberadas (spec 2026-07-28, §4):
 *   · `principal` no existe: es `role = null`, y darle un valor propio serían
 *     dos formas de decir lo mismo.
 *   · el `nexo` del mockup se llama aquí `crossover`, porque «nexo» ya nombra en
 *     este producto el grupo de miembros directos del universo. */
export const SAGA_ITEM_ROLES = [
  "precuela",
  "novela_corta",
  "relato",
  "spin_off",
  "companero",
  "crossover",
  // Sale del vocabulario en la migración 20260807 (0 filas en producción). Se
  // mantiene aquí mientras el enum de la BD lo tenga: la lista tiene que ser el
  // enum, y `roles.test.ts` lo exige.
  "paralela",
] as const;

export type SagaItemRole = (typeof SAGA_ITEM_ROLES)[number];
