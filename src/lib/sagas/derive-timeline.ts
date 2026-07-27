import type { SagaAccentToken } from "./accents";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { DetailMember } from "./types";

// Derivación DETERMINISTA del timeline móvil (frame B, spec §2.4) a partir del
// grafo. La columna son los nodos-ítem con orderNo agrupados por subsaga
// consecutiva; los nodos sin orden cuelgan como ramas de su conexión más
// temprana (o del final de su sección si están sueltos); los nexos (sin grupo)
// conectados a la columna se pintan como puente entre secciones. Los
// nodos-saga solo viven en el mapa 2D. Las aristas opcional/requisito entre dos
// nodos DE COLUMNA se ignoran a propósito: la columna ya transmite el orden.
// El determinismo asume que graph.edges llega en orden estable (getSagaDetail
// ordena por created_at) — saga_edges no tiene columna created_at, así que ahí
// se ordena por id; sigue siendo un orden estable, solo no cronológico.

export type TimelineBranch = { node: SagaGraphNode; edgeType: "opcional" | "requisito" };
export type TimelineRow =
  | { kind: "entry"; node: SagaGraphNode; branches: TimelineBranch[] }
  | { kind: "bridge"; node: SagaGraphNode };
export type TimelineSection = {
  groupSagaId: string | null;
  groupName: string | null;
  accent: SagaAccentToken;
  rows: TimelineRow[];
};

export function deriveTimeline(graph: SagaGraph): TimelineSection[] {
  const items = graph.nodes.filter((n) => n.kind === "item");
  const spine = items
    .filter((n) => n.orderNo !== null)
    .sort((a, b) => (a.orderNo! - b.orderNo!) || a.label.localeCompare(b.label));
  if (spine.length === 0) return [];

  const spineIds = new Set(spine.map((n) => n.id));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // Conexión más temprana de un nodo fuera de columna: el nodo de columna con
  // menor orderNo entre sus aristas (en cualquier dirección).
  const earliestSpineFor = (nodeId: string): { spineNode: SagaGraphNode; edgeType: "opcional" | "requisito" } | null => {
    let best: { spineNode: SagaGraphNode; edgeType: "opcional" | "requisito" } | null = null;
    for (const e of graph.edges) {
      const otherId = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
      if (!otherId || !spineIds.has(otherId)) continue;
      const other = byId.get(otherId)!;
      const edgeType = e.type === "requisito" ? "requisito" : "opcional";
      if (!best || other.orderNo! < best.spineNode.orderNo!) best = { spineNode: other, edgeType };
    }
    return best;
  };

  // Secciones por subsaga consecutiva a lo largo de la columna.
  const sections: TimelineSection[] = [];
  const rowByNodeId = new Map<string, Extract<TimelineRow, { kind: "entry" }>>();
  for (const n of spine) {
    const last = sections.at(-1);
    const row: Extract<TimelineRow, { kind: "entry" }> = { kind: "entry", node: n, branches: [] };
    rowByNodeId.set(n.id, row);
    if (last && last.groupSagaId === n.groupSagaId) last.rows.push(row);
    else sections.push({ groupSagaId: n.groupSagaId, groupName: n.groupName, accent: n.accent, rows: [row] });
  }

  // Nodos-ítem fuera de columna: rama o puente.
  const bridges: Array<{ node: SagaGraphNode; afterSectionIdx: number }> = [];
  for (const n of items) {
    if (n.orderNo !== null) continue;
    const conn = earliestSpineFor(n.id);
    if (n.groupSagaId === null) {
      // Nexo: puente tras la sección de su conexión más temprana; sin conexión, fuera del timeline.
      if (!conn) continue;
      const idx = sections.findIndex((s) => s.rows.some((r) => r.kind === "entry" && r.node.id === conn.spineNode.id));
      bridges.push({ node: n, afterSectionIdx: idx });
      continue;
    }
    if (conn) {
      rowByNodeId.get(conn.spineNode.id)!.branches.push({ node: n, edgeType: conn.edgeType });
      continue;
    }
    // Suelto dentro de su subsaga: cuelga del último de su sección (si existe).
    const section = sections.find((s) => s.groupSagaId === n.groupSagaId);
    const lastEntry = section?.rows.filter((r): r is Extract<TimelineRow, { kind: "entry" }> => r.kind === "entry").at(-1);
    lastEntry?.branches.push({ node: n, edgeType: "opcional" });
  }

  for (const row of rowByNodeId.values()) {
    row.branches.sort((a, b) => a.node.label.localeCompare(b.node.label));
  }

  // Insertar puentes tras su sección ancla. Agrupados por ancla e insertados
  // como un solo splice en orden alfabético: splices sueltos sobre el mismo
  // índice invertirían el orden (el segundo empuja al primero).
  const byAnchor = new Map<number, SagaGraphNode[]>();
  for (const b of bridges) {
    const list = byAnchor.get(b.afterSectionIdx) ?? [];
    list.push(b.node);
    byAnchor.set(b.afterSectionIdx, list);
  }
  for (const idx of [...byAnchor.keys()].sort((a, b) => b - a)) {
    const nodes = byAnchor.get(idx)!.sort((a, b) => a.label.localeCompare(b.label));
    sections.splice(
      idx + 1,
      0,
      ...nodes.map((node) => ({
        groupSagaId: null,
        groupName: null,
        accent: "beige" as const,
        rows: [{ kind: "bridge" as const, node }],
      })),
    );
  }

  return sections;
}

// Orden «Publicación» (spec §2.4): lista lineal por año del catálogo.
export function sortByPublication(members: DetailMember[]): DetailMember[] {
  return [...members].sort((a, b) => {
    const ya = a.year ?? Number.MAX_SAFE_INTEGER;
    const yb = b.year ?? Number.MAX_SAFE_INTEGER;
    if (ya !== yb) return ya - yb;
    return a.title.localeCompare(b.title);
  });
}

// Escala coordenadas de lienzo al viewBox del mini-preview del CTA (frame B).
export function scaleNodes(
  nodes: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  pad: number,
): Array<{ x: number; y: number }> {
  if (nodes.length === 0) return [];
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  return nodes.map((n) => ({
    x: spanX === 0 ? width / 2 : pad + ((n.x - minX) / spanX) * (width - 2 * pad),
    y: spanY === 0 ? height / 2 : pad + ((n.y - minY) / spanY) * (height - 2 * pad),
  }));
}
