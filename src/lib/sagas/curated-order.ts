import type { ItemType } from "@/lib/catalog/types";
import type { SagaPlacement } from "./types";

// Orden principal de una saga: la SECUENCIA con la que se pinta (columna del
// timeline, expansión de bloques en un itinerario, portadas y «siguiente» de
// las cards). NO es el denominador del progreso: eso vive en ./progress.ts
// (countedKeys) y sale de la pertenencia, no del orden.
//
// Fase 3 (Task 4, issue #185): hasta esta tarea, el orden salía de
// main-order.ts, que mezclaba dos criterios — si la saga tenía nodos de
// grafo (saga_nodes) mandaba el grafo, y si no mandaba `position`. Esa
// asimetría era el #185. Con saga_nodes retirado del todo (fase 3), solo
// queda un criterio: la CURACIÓN (saga_items + sagas.position_in_parent /
// placement_in_parent) es la única fuente del orden principal, para todos
// los consumidores. Por eso un miembro ya NO puede quedar fuera de la
// SECUENCIA por falta de "hueco en el grafo" (issue #170, ver main-order.ts
// en el historial): sin grafo, todo miembro tiene sitio — los que no tienen
// `position` simplemente van al final, por título.

export type OrderSaga = {
  id: string;
  name: string;
  parentSagaId: string | null;
  /** Colocación del bloque en su padre (sagas.position_in_parent). */
  positionInParent: number | null;
  /** Colocación del bloque en su padre (sagas.placement_in_parent). */
  placementInParent: SagaPlacement | null;
};
export type OrderMembership = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  position: number | null;
};

export const itemKey = (t: ItemType, i: string) => `${t}:${i}`;

// Cap de profundidad como cinturón frente a ciclos (el trigger de BD ya los
// impide); mismo valor que fetchDescendants en get-saga-detail.
const MAX_DEPTH = 4;

/**
 * Indexa el árbol una sola vez y devuelve el calculador del orden principal.
 * `titleOf` resuelve el título de una clave `item_type:item_id` para el
 * desempate alfabético de los miembros sin position.
 */
export function createCuratedOrder(
  sagas: OrderSaga[],
  memberships: OrderMembership[],
  titleOf: (key: string) => string,
): (rootId: string) => string[] {
  const sagaById = new Map(sagas.map((s) => [s.id, s]));
  const childrenByParent = new Map<string, OrderSaga[]>();
  for (const s of sagas) {
    if (s.parentSagaId === null || !sagaById.has(s.parentSagaId)) continue;
    const list = childrenByParent.get(s.parentSagaId) ?? [];
    list.push(s);
    childrenByParent.set(s.parentSagaId, list);
  }
  const membersBySaga = new Map<string, OrderMembership[]>();
  for (const m of memberships) {
    const list = membersBySaga.get(m.sagaId) ?? [];
    list.push(m);
    membersBySaga.set(m.sagaId, list);
  }

  // Heurística vieja (issue #204): antes de la fase 2a no había forma de
  // expresar la colocación de un bloque, así que el orden de las hijas salía
  // del `position` MÍNIMO de sus miembros. Se conserva como DESEMPATE cuando
  // ninguna de las dos hijas comparadas tiene `positionInParent` — mismo
  // criterio que `childGroups` en group-members.ts, para que las 6 subsagas
  // sin colocar que hay en prod no se muevan de sitio por este cambio.
  const minPos = (sagaId: string) =>
    (membersBySaga.get(sagaId) ?? []).reduce(
      (min, m) => Math.min(min, m.position ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );

  // `visited` es compartido por toda la recursión de una llamada: impide que un
  // ciclo saga→saga cuelgue y que una saga alcanzable por dos caminos duplique
  // sus títulos en la SECUENCIA (el `new Set(...)` de `curatedOrder`, abajo, ya
  // dedupica el resultado final, pero sin `visited` la recursión ni siquiera
  // terminaría). Esto no es el denominador del progreso: ese vive en
  // countedKeys (./progress.ts).
  function walk(sagaId: string, depth: number, visited: Set<string>): string[] {
    if (depth > MAX_DEPTH || visited.has(sagaId)) return [];
    visited.add(sagaId);
    const out: string[] = [];
    const direct = [...(membersBySaga.get(sagaId) ?? [])].sort((a, b) => {
      const pa = a.position ?? Number.MAX_SAFE_INTEGER;
      const pb = b.position ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return titleOf(itemKey(a.itemType, a.itemId)).localeCompare(
        titleOf(itemKey(b.itemType, b.itemId)),
      );
    });
    out.push(...direct.map((m) => itemKey(m.itemType, m.itemId)));

    // Colocación curada (issue #204): las hijas ya no se ordenan por el hueco
    // mínimo de sus miembros, sino por `position_in_parent` — el mismo
    // comparador que ya usa `childGroups` en group-members.ts (verificado con
    // 5 permutaciones, es el que la ficha enseña hoy). Una hija `libre` no
    // tiene `positionInParent` (lo impone el CHECK de la migración), así que
    // cae detrás de las colocadas por la misma vía: la rama del fallback.
    const children = [...(childrenByParent.get(sagaId) ?? [])].sort((a, b) => {
      if (a.positionInParent !== null && b.positionInParent !== null) {
        return a.positionInParent - b.positionInParent || a.name.localeCompare(b.name);
      }
      if (a.positionInParent !== null) return -1;
      if (b.positionInParent !== null) return 1;
      const pa = minPos(a.id);
      const pb = minPos(b.id);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
    for (const c of children) out.push(...walk(c.id, depth + 1, visited));
    return out;
  }

  /** Claves `item_type:item_id` del orden principal de `rootId`, deduplicadas. */
  return function curatedOrder(rootId: string): string[] {
    return [...new Set(walk(rootId, 0, new Set()))];
  };
}
