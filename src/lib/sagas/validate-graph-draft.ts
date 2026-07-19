import type { EditorEdge, EditorNode } from "./editor-types";

// Validación pura del borrador del editor (spec §3): errores DUROS que la BD
// rechazaría (XOR, únicos, FKs, CHECK de order_no/label) detectados antes de
// llamar a la RPC, con ids concretos para señalarlos en el lienzo. Las
// colisiones de order_no son AVISO, no error: el timeline las tolera (empate
// determinista por label).

export type DraftError =
  | { code: "ref-xor"; nodeId: string }
  | { code: "dup-item"; nodeId: string }
  | { code: "dup-child"; nodeId: string }
  | { code: "edge-endpoint"; edgeId: string }
  | { code: "edge-self"; edgeId: string }
  | { code: "bad-order"; nodeId: string }
  | { code: "label-too-long"; nodeId: string };

export function validateGraphDraft(nodes: EditorNode[], edges: EditorEdge[]): DraftError[] {
  const errors: DraftError[] = [];
  const seenItems = new Set<string>();
  const seenChildren = new Set<string>();
  const ids = new Set<string>();

  for (const n of nodes) {
    ids.add(n.id);
    const isItem = n.itemType !== null && n.itemId !== null;
    const isChild = n.childSagaId !== null;
    if (isItem === isChild) {
      errors.push({ code: "ref-xor", nodeId: n.id });
      continue;
    }
    if (n.orderNo !== null && (!Number.isInteger(n.orderNo) || n.orderNo < 1)) {
      errors.push({ code: "bad-order", nodeId: n.id });
    }
    if (n.labelOverride && n.labelOverride.length > 120) {
      errors.push({ code: "label-too-long", nodeId: n.id });
    }
    if (isItem) {
      const key = `${n.itemType}:${n.itemId}`;
      if (seenItems.has(key)) errors.push({ code: "dup-item", nodeId: n.id });
      seenItems.add(key);
    } else {
      if (seenChildren.has(n.childSagaId!)) errors.push({ code: "dup-child", nodeId: n.id });
      seenChildren.add(n.childSagaId!);
    }
  }

  for (const e of edges) {
    if (e.fromNode === e.toNode) {
      errors.push({ code: "edge-self", edgeId: e.id });
      continue;
    }
    if (!ids.has(e.fromNode) || !ids.has(e.toNode)) {
      errors.push({ code: "edge-endpoint", edgeId: e.id });
    }
  }
  return errors;
}

export function findOrderCollisions(nodes: EditorNode[]): number[] {
  const counts = new Map<number, number>();
  for (const n of nodes) {
    if (n.orderNo !== null) counts.set(n.orderNo, (counts.get(n.orderNo) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c > 1).map(([v]) => v);
}
