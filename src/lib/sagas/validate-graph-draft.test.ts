import { describe, expect, it } from "vitest";
import type { EditorEdge, EditorNode } from "./editor-types";
import { findOrderCollisions, validateGraphDraft } from "./validate-graph-draft";

const itemNode = (id: string, over: Partial<EditorNode> = {}): EditorNode => ({
  id,
  itemType: "book",
  itemId: `it-${id}`,
  childSagaId: null,
  x: 0,
  y: 0,
  level: "principal",
  orderNo: null,
  labelOverride: null,
  ...over,
});

const edge = (id: string, fromNode: string, toNode: string): EditorEdge => ({
  id,
  fromNode,
  toNode,
  edgeType: "principal",
});

describe("validateGraphDraft", () => {
  it("borrador válido → sin errores", () => {
    const nodes = [itemNode("a", { orderNo: 1 }), itemNode("s", { itemType: null, itemId: null, childSagaId: "child" })];
    expect(validateGraphDraft(nodes, [edge("e", "a", "s")])).toEqual([]);
  });

  it("ref-xor: nodo sin referencia o con ambas", () => {
    const none = itemNode("n", { itemType: null, itemId: null });
    const both = itemNode("b", { childSagaId: "c" });
    expect(validateGraphDraft([none, both], [])).toEqual([
      { code: "ref-xor", nodeId: "n" },
      { code: "ref-xor", nodeId: "b" },
    ]);
  });

  it("dup-item / dup-child: misma referencia en dos nodos", () => {
    const a1 = itemNode("a1", { itemId: "X" });
    const a2 = itemNode("a2", { itemId: "X" });
    const s1 = itemNode("s1", { itemType: null, itemId: null, childSagaId: "C" });
    const s2 = itemNode("s2", { itemType: null, itemId: null, childSagaId: "C" });
    expect(validateGraphDraft([a1, a2, s1, s2], [])).toEqual([
      { code: "dup-item", nodeId: "a2" },
      { code: "dup-child", nodeId: "s2" },
    ]);
  });

  it("edge-endpoint y edge-self", () => {
    const a = itemNode("a");
    expect(validateGraphDraft([a], [edge("e1", "a", "fantasma"), edge("e2", "a", "a")])).toEqual([
      { code: "edge-endpoint", edgeId: "e1" },
      { code: "edge-self", edgeId: "e2" },
    ]);
  });

  it("bad-order y label-too-long", () => {
    const bad = itemNode("b", { orderNo: 0 });
    const long = itemNode("l", { labelOverride: "x".repeat(121) });
    expect(validateGraphDraft([bad, long], [])).toEqual([
      { code: "bad-order", nodeId: "b" },
      { code: "label-too-long", nodeId: "l" },
    ]);
  });
});

describe("findOrderCollisions", () => {
  it("devuelve los order_no repetidos, una vez cada uno", () => {
    const nodes = [
      itemNode("a", { orderNo: 1 }),
      itemNode("b", { orderNo: 2 }),
      itemNode("c", { orderNo: 2 }),
      itemNode("d", { orderNo: 2 }),
    ];
    expect(findOrderCollisions(nodes)).toEqual([2]);
  });
  it("sin colisiones → []", () => {
    expect(findOrderCollisions([itemNode("a", { orderNo: 1 })])).toEqual([]);
  });
});
