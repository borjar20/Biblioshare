import type { ItemType } from "@/lib/catalog/types";

// Orden principal de una saga: la SECUENCIA con la que se pinta (columna del
// timeline, expansión de bloques en un itinerario, portadas y «siguiente» de
// las cards). NO es el denominador del progreso desde el 2026-07-25: eso vive
// en ./progress.ts (countedKeys) y sale de la pertenencia, no del orden.
//
// OJO con la asimetría del issue #185, que sigue viva AQUÍ aunque ya no afecte
// a ningún número: con grafo, un nodo sin order_no no entra en la secuencia;
// sin grafo, entran todos los miembros. Muere en la fase 3, cuando se retire
// saga_nodes.

export type OrderSaga = { id: string; name: string; parentSagaId: string | null };
export type OrderMembership = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  position: number | null;
};
export type OrderNode = {
  sagaId: string;
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  orderNo: number | null;
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
export function createMainOrder(
  sagas: OrderSaga[],
  memberships: OrderMembership[],
  nodes: OrderNode[],
  titleOf: (key: string) => string,
) {
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
  const nodesBySaga = new Map<string, OrderNode[]>();
  for (const n of nodes) {
    const list = nodesBySaga.get(n.sagaId) ?? [];
    list.push(n);
    nodesBySaga.set(n.sagaId, list);
  }
  // Issue #170: un nodo-ítem puede apuntar a algo que no es miembro
  // (saga_nodes.item_id no tiene FK y save_saga_graph no valida la membresía).
  // buildSagaGraph ya lo descarta al pintar, así que el usuario no puede verlo
  // ni marcarlo: se descarta aquí por lo mismo (no tiene sentido pintarlo en
  // el abanico ni proponerlo como «siguiente»), no por proteger un
  // denominador — ese vive en countedKeys (./progress.ts), que ni siquiera
  // mira el grafo, así que el #170 no puede reaparecer ahí. Mismo criterio
  // que el lookup `members` de buildSagaGraph: la membresía puede vivir en
  // cualquier saga del árbol, no solo en la del nodo.
  const memberKeys = new Set(memberships.map((m) => itemKey(m.itemType, m.itemId)));

  const minPos = (sagaId: string) =>
    (membersBySaga.get(sagaId) ?? []).reduce(
      (min, m) => Math.min(min, m.position ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );

  // `visited` es compartido por toda la recursión de una llamada: impide que un
  // ciclo saga→saga cuelgue y que una saga alcanzable por dos caminos duplique
  // sus títulos en el denominador.
  function walk(sagaId: string, depth: number, visited: Set<string>): string[] {
    if (depth > MAX_DEPTH || visited.has(sagaId)) return [];
    visited.add(sagaId);
    const out: string[] = [];
    const sagaNodes = nodesBySaga.get(sagaId) ?? [];
    if (sagaNodes.length > 0) {
      const ordered = sagaNodes
        .filter((n) => n.orderNo !== null)
        .sort((a, b) => a.orderNo! - b.orderNo!);
      for (const n of ordered) {
        if (n.itemType !== null && n.itemId !== null) {
          const key = itemKey(n.itemType, n.itemId);
          if (memberKeys.has(key)) out.push(key);
        } else if (n.childSagaId !== null) out.push(...walk(n.childSagaId, depth + 1, visited));
      }
    } else {
      const direct = [...(membersBySaga.get(sagaId) ?? [])].sort((a, b) => {
        const pa = a.position ?? Number.MAX_SAFE_INTEGER;
        const pb = b.position ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return titleOf(itemKey(a.itemType, a.itemId)).localeCompare(
          titleOf(itemKey(b.itemType, b.itemId)),
        );
      });
      out.push(...direct.map((m) => itemKey(m.itemType, m.itemId)));
      const children = [...(childrenByParent.get(sagaId) ?? [])].sort((a, b) => {
        const pa = minPos(a.id);
        const pb = minPos(b.id);
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
      for (const c of children) out.push(...walk(c.id, depth + 1, visited));
    }
    return out;
  }

  /** Claves `item_type:item_id` del orden principal de `rootId`, deduplicadas. */
  return function mainOrder(rootId: string): string[] {
    return [...new Set(walk(rootId, 0, new Set()))];
  };
}
