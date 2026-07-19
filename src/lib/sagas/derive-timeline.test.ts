import { describe, expect, it } from "vitest";
import { deriveTimeline, scaleNodes, sortByPublication } from "./derive-timeline";
import type { SagaGraph, SagaGraphNode } from "./graph-data";
import type { DetailMember } from "./types";

const node = (id: string, over: Partial<SagaGraphNode> = {}): SagaGraphNode => ({
  id,
  kind: "item",
  x: 0,
  y: 0,
  level: "principal",
  orderNo: null,
  label: id,
  accent: "verde",
  status: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: "g1",
  groupName: "Era Uno",
  ...over,
});

const graph = (nodes: SagaGraphNode[], edges: SagaGraph["edges"] = []): SagaGraph => ({ nodes, edges });

describe("deriveTimeline", () => {
  it("la columna son los nodos con orderNo, en secciones por subsaga consecutiva", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 1 }),
        node("b", { orderNo: 2 }),
        node("c", { orderNo: 3, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
      ]),
    );
    expect(tl).toHaveLength(2);
    expect(tl[0]).toMatchObject({ groupSagaId: "g1", groupName: "Era Uno", accent: "verde" });
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.node.id)).toEqual(["a", "b"]);
    expect(tl[1].rows.map((r) => r.kind === "entry" && r.node.id)).toEqual(["c"]);
  });

  it("un nodo sin orderNo conectado por arista opcional cuelga como rama de su origen", () => {
    const spin = node("spin", { orderNo: null });
    const tl = deriveTimeline(
      graph(
        [node("a", { orderNo: 1 }), node("b", { orderNo: 2 }), spin],
        [{ id: "e", source: "a", target: "spin", type: "opcional", accent: "ambar" }],
      ),
    );
    const rowA = tl[0].rows[0];
    expect(rowA.kind).toBe("entry");
    if (rowA.kind === "entry") {
      expect(rowA.branches).toEqual([{ node: spin, edgeType: "opcional" }]);
    }
  });

  it("un nodo suelto de una subsaga (sin aristas) cuelga del último de su sección como opcional", () => {
    const loose = node("loose");
    const tl = deriveTimeline(graph([node("a", { orderNo: 1 }), node("b", { orderNo: 2 }), loose]));
    const lastRow = tl[0].rows.at(-1)!;
    if (lastRow.kind === "entry") {
      expect(lastRow.branches.map((b) => b.node.id)).toEqual(["loose"]);
    } else {
      throw new Error("esperaba entry");
    }
  });

  it("un nexo (sin grupo, sin orden) conectado a la columna se inserta como puente tras la sección de su conexión más temprana", () => {
    const hub = node("hub", { groupSagaId: null, groupName: null, accent: "beige" });
    const tl = deriveTimeline(
      graph(
        [
          node("a", { orderNo: 1 }),
          node("c", { orderNo: 2, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
          hub,
        ],
        [
          { id: "e1", source: "a", target: "hub", type: "requisito", accent: "beige" },
          { id: "e2", source: "hub", target: "c", type: "requisito", accent: "beige" },
        ],
      ),
    );
    // secciones: [g1], bridge, [g2]
    expect(tl).toHaveLength(3);
    expect(tl[1].rows[0]).toEqual({ kind: "bridge", node: hub });
  });

  it("los nodos-saga no aparecen en el timeline (solo en el mapa 2D)", () => {
    const tl = deriveTimeline(
      graph([node("a", { orderNo: 1 }), node("s", { kind: "saga", orderNo: 2, groupSagaId: "g2" })]),
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].rows).toHaveLength(1);
  });

  it("grafo vacío → []", () => {
    expect(deriveTimeline(graph([]))).toEqual([]);
  });
});

describe("sortByPublication", () => {
  const m = (itemId: string, year: number | null, title = itemId): DetailMember => ({
    itemType: "book", itemId, title, coverUrl: null, href: `/libro/${itemId}`,
    position: null, status: null, groupSagaId: null, year,
  });
  it("ordena por año ascendente, nulls al final, empate por título", () => {
    expect(sortByPublication([m("b", 2001), m("d", null), m("a", 1999), m("c", 2001, "AAA")]).map((x) => x.itemId))
      .toEqual(["a", "c", "b", "d"]);
  });
  it("no muta el array de entrada", () => {
    const input = [m("b", 2001), m("a", 1999)];
    sortByPublication(input);
    expect(input.map((x) => x.itemId)).toEqual(["b", "a"]);
  });
});

describe("scaleNodes", () => {
  it("mapea el bounding box de los nodos al lienzo con padding", () => {
    const out = scaleNodes([{ x: 100, y: 100 }, { x: 300, y: 500 }], 66, 48, 4);
    expect(out[0]).toEqual({ x: 4, y: 4 });
    expect(out[1]).toEqual({ x: 62, y: 44 });
  });
  it("un solo nodo cae centrado", () => {
    expect(scaleNodes([{ x: 42, y: 7 }], 66, 48, 4)).toEqual([{ x: 33, y: 24 }]);
  });
});
