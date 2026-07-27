import { sagaHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";
import type { SagaAccentToken } from "./accents";
import type { DetailMember } from "./types";
import type { SagaGraph, SagaGraphEdge, SagaGraphNode } from "./map-types";

// Resolución PURA del grafo (spec §2.5): filas crudas de saga_nodes/saga_edges
// → nodos con label/accent/status y aristas coloreadas. La subsaga de un nodo
// NO está en la fila: se deriva de la membresía del ítem (lookup construido
// por getSagaDetail con los mismos datos de la pestaña Info — una sola fuente
// de verdad, spec §1.3).

export type RawSagaNode = {
  id: string;
  item_type: ItemType | null;
  item_id: string | null;
  child_saga_id: string | null;
  x: number;
  y: number;
  level: "principal" | "menor";
  order_no: number | null;
  label_override: string | null;
};

export type RawSagaEdge = {
  id: string;
  from_node: string;
  to_node: string;
  edge_type: "principal" | "opcional" | "requisito";
};

// Los tipos del grafo viven ahora en map-types.ts (fase 3, Task 1): tanto este
// fichero como el futuro derive-map.ts producen el mismo `SagaGraph`, y la
// vista no debe depender de cuál de los dos lo construyó. Re-exportados aquí
// para no tocar los imports existentes; graph-data.ts se borra en la Task 2.
export type { SagaGraph, SagaGraphNode, SagaGraphEdge };

export type GraphLookup = {
  /** "tipo:id" → miembro resuelto (título, cover, status, subsaga, year) */
  members: Map<string, DetailMember>;
  groupAccent: Map<string | null, SagaAccentToken>;
  groupName: Map<string | null, string | null>;
  childNames: Map<string, string>;
  childCovers: Map<string, string[]>;
  childCounts: Map<string, number>;
};

export function buildSagaGraph(
  rawNodes: RawSagaNode[],
  rawEdges: RawSagaEdge[],
  lookup: GraphLookup,
): SagaGraph {
  const nodes: SagaGraphNode[] = [];
  for (const raw of rawNodes) {
    if (raw.item_type && raw.item_id) {
      const m = lookup.members.get(`${raw.item_type}:${raw.item_id}`);
      if (!m) continue; // integridad: el ítem ya no es miembro/catálogo — nodo huérfano fuera
      nodes.push({
        id: raw.id,
        kind: "item",
        x: raw.x,
        y: raw.y,
        level: raw.level,
        orderNo: raw.order_no,
        label: raw.label_override ?? m.title,
        accent: lookup.groupAccent.get(m.groupSagaId) ?? "beige",
        status: m.status,
        role: m.role,
        coverUrl: m.coverUrl,
        covers: [],
        href: m.href,
        memberCount: null,
        groupSagaId: m.groupSagaId,
        groupName: lookup.groupName.get(m.groupSagaId) ?? null,
      });
    } else if (raw.child_saga_id) {
      const name = lookup.childNames.get(raw.child_saga_id);
      if (!name) continue;
      nodes.push({
        id: raw.id,
        kind: "saga",
        x: raw.x,
        y: raw.y,
        level: raw.level,
        orderNo: raw.order_no,
        label: raw.label_override ?? name,
        accent: lookup.groupAccent.get(raw.child_saga_id) ?? "beige",
        status: null,
        role: null,
        coverUrl: null,
        covers: lookup.childCovers.get(raw.child_saga_id) ?? [],
        href: sagaHref(raw.child_saga_id),
        memberCount: lookup.childCounts.get(raw.child_saga_id) ?? null,
        groupSagaId: raw.child_saga_id,
        groupName: name,
      });
    }
  }

  // Orden estable: order_no (nulls al final), luego label.
  nodes.sort((a, b) => {
    const oa = a.orderNo ?? Number.MAX_SAFE_INTEGER;
    const ob = b.orderNo ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label);
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: SagaGraphEdge[] = [];
  for (const raw of rawEdges) {
    const source = byId.get(raw.from_node);
    if (!source || !byId.has(raw.to_node)) continue;
    edges.push({
      id: raw.id,
      source: raw.from_node,
      target: raw.to_node,
      type: raw.edge_type,
      accent:
        raw.edge_type === "opcional" ? "ambar"
        : raw.edge_type === "requisito" ? "beige"
        : source.accent,
    });
  }

  return { nodes, edges };
}
