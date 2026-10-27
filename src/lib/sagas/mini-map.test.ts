import { describe, expect, it } from "vitest";
import type { SagaGraph, SagaGraphEdge, SagaGraphNode } from "./map-types";
import { miniMapPoints } from "./mini-map";

const node = (id: string, over: Partial<SagaGraphNode> = {}): SagaGraphNode => ({
  id, kind: "item", x: 0, y: 0, level: "principal", orderNo: 1, label: id, accent: "verde",
  status: "pending" as SagaGraphNode["status"], role: null, coverUrl: null, covers: [], href: "/",
  memberCount: null, groupSagaId: null, groupName: null, step: null, tandem: null,
  windowReason: null, optional: false, skipped: false, ownerSagaId: "s", ...over,
});
const edge = (source: string, target: string, type: SagaGraphEdge["type"] = "principal"): SagaGraphEdge => ({
  id: `${source}-${target}`, source, target, type, accent: "verde",
});
const graph = (nodes: SagaGraphNode[], edges: SagaGraphEdge[] = []): SagaGraph => ({ nodes, edges });

describe("miniMapPoints", () => {
  it("descarta los nodos que no son item", () => {
    const m = miniMapPoints(graph([node("a"), node("s", { kind: "saga" })]));
    expect(m.points.map((p) => p.id)).toEqual(["a"]);
    expect([m.width, m.height]).toEqual([160, 80]);
  });
  it("normaliza x entre 8 y 152 e y entre 8 y 72", () => {
    const m = miniMapPoints(graph([node("a", { x: 100, y: 50 }), node("b", { x: 500, y: 250 }), node("c", { x: 300, y: 150 })]));
    const xs = m.points.map((p) => p.cx);
    const ys = m.points.map((p) => p.cy);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([8, 152]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([8, 72]);
  });
  it("con todos en la misma y, quedan en cy=40 (y en la misma x, cx=80)", () => {
    const m = miniMapPoints(graph([node("a", { x: 0, y: 7 }), node("b", { x: 10, y: 7 })]));
    expect(m.points.map((p) => p.cy)).toEqual([40, 40]);
    const n = miniMapPoints(graph([node("a", { x: 3, y: 0 }), node("b", { x: 3, y: 9 })]));
    expect(n.points.map((p) => p.cx)).toEqual([80, 80]);
  });
  it("recorta a max por orderNo ascendente, con los null al final", () => {
    const m = miniMapPoints(
      graph([node("n", { orderNo: null }), node("c", { orderNo: 3 }), node("a", { orderNo: 1 }), node("b", { orderNo: 2 })]),
      2,
    );
    expect(m.points.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(miniMapPoints(graph([node("n", { orderNo: null }), node("a", { orderNo: 1 })]), 2).points).toHaveLength(2);
  });
  it("una línea con un extremo descartado desaparece", () => {
    const m = miniMapPoints(
      graph([node("a", { x: 0 }), node("b", { x: 10 }), node("s", { kind: "saga", x: 5 })], [edge("a", "b"), edge("a", "s")]),
    );
    expect(m.lines).toHaveLength(1);
  });
  it("dashed solo en las aristas que no son principal; done según status", () => {
    const m = miniMapPoints(
      graph(
        [node("a", { x: 0, status: "completed" as SagaGraphNode["status"] }), node("b", { x: 10 })],
        [edge("a", "b", "opcional"), edge("b", "a", "principal")],
      ),
    );
    expect(m.lines.map((l) => l.dashed)).toEqual([true, false]);
    expect(m.points.map((p) => p.done)).toEqual([true, false]);
  });
});
