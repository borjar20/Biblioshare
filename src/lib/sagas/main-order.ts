import type { ItemType } from "@/lib/catalog/types";

// Orden principal de una saga (spec §1.5) — la ÚNICA definición, compartida por
// los tres sitios donde la spec dice que aplica la regla de cómputo: hero
// (get-saga-detail), cards de Mi Biblioteca (build-library-saga-cards) y
// timeline. Vivía duplicada dentro de build-library-saga-cards y el hero no la
// tenía: contaba TODOS los miembros del subárbol, así que un grafo con
// opcionales daba 2/7 en el hero y 2/5 en la card (issue #91).
//
// La regla: con grafo, los nodos con order_no (un nodo-saga expande
// recursivamente el orden principal de esa saga); sin grafo, los miembros
// directos por position y luego las hijas por su menor position. Los opcionales
// (nodos sin order_no) nunca entran, así que no penalizan el avance.

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
  // ni marcarlo; si contase en el denominador, el avance nunca llegaría al
  // 100%. Mismo criterio que el lookup `members` de buildSagaGraph: la
  // membresía puede vivir en cualquier saga del árbol, no solo en la del nodo.
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
