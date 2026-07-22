import { describe, expect, it } from "vitest";
import { buildSagaGraph, type GraphLookup, type RawSagaEdge, type RawSagaNode } from "./graph-data";
import type { DetailMember } from "./types";

const member = (over: Partial<DetailMember>): DetailMember => ({
  itemType: "book",
  itemId: over.itemId ?? "x",
  title: over.title ?? "Título",
  coverUrl: over.coverUrl ?? "https://c/x.jpg",
  href: `/libro/${over.itemId ?? "x"}`,
  position: null,
  role: null,
  status: null,
  groupSagaId: null,
  year: null,
  ...over,
});

const itemNode = (id: string, itemId: string, over: Partial<RawSagaNode> = {}): RawSagaNode => ({
  id,
  item_type: "book",
  item_id: itemId,
  child_saga_id: null,
  x: 100,
  y: 100,
  level: "principal",
  order_no: null,
  label_override: null,
  ...over,
});

const lookup = (): GraphLookup => ({
  members: new Map([
    ["book:a", member({ itemId: "a", title: "Alfa", groupSagaId: "g1", status: "completed" })],
    ["book:b", member({ itemId: "b", title: "Beta", groupSagaId: null })],
  ]),
  groupAccent: new Map([
    ["g1", "verde"],
    [null, "beige"],
  ]),
  groupName: new Map([
    ["g1", "Era Uno"],
    [null, null],
  ]),
  childNames: new Map([["g2", "Era Dos"]]),
  childCovers: new Map([["g2", ["https://c/1.jpg", "https://c/2.jpg"]]]),
  childCounts: new Map([["g2", 5]]),
});

describe("buildSagaGraph", () => {
  it("resuelve nodo-ítem: label, accent del grupo, status, href", () => {
    const g = buildSagaGraph([itemNode("n1", "a", { order_no: 1 })], [], lookup());
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]).toMatchObject({
      id: "n1", kind: "item", orderNo: 1, label: "Alfa", accent: "verde",
      status: "completed", href: "/libro/a", groupSagaId: "g1", groupName: "Era Uno",
    });
  });

  it("label_override manda sobre el título", () => {
    const g = buildSagaGraph([itemNode("n1", "a", { label_override: "Alfa (ed. 1)" })], [], lookup());
    expect(g.nodes[0].label).toBe("Alfa (ed. 1)");
  });

  it("nodo-ítem directo (sin subsaga) sale beige", () => {
    const g = buildSagaGraph([itemNode("n2", "b")], [], lookup());
    expect(g.nodes[0].accent).toBe("beige");
  });

  it("resuelve nodo-saga: nombre, portadas, contador, href a la ficha de la saga", () => {
    const raw: RawSagaNode = { ...itemNode("n3", "ignored"), item_type: null, item_id: null, child_saga_id: "g2" };
    const g = buildSagaGraph([raw], [], lookup());
    expect(g.nodes[0]).toMatchObject({
      kind: "saga", label: "Era Dos", covers: ["https://c/1.jpg", "https://c/2.jpg"],
      memberCount: 5, href: "/saga/g2", status: null,
    });
  });

  it("descarta nodos con referencia irresoluble y las aristas que cuelgan de ellos", () => {
    const nodes = [itemNode("n1", "a"), itemNode("nx", "no-existe")];
    const edges: RawSagaEdge[] = [
      { id: "e1", from_node: "n1", to_node: "nx", edge_type: "principal" },
    ];
    const g = buildSagaGraph(nodes, edges, lookup());
    expect(g.nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(g.edges).toEqual([]);
  });

  it("colorea aristas: principal=accent del origen, opcional=ambar, requisito=beige", () => {
    const nodes = [itemNode("n1", "a", { order_no: 1 }), itemNode("n2", "b", { order_no: 2 })];
    const edges: RawSagaEdge[] = [
      { id: "e1", from_node: "n1", to_node: "n2", edge_type: "principal" },
      { id: "e2", from_node: "n2", to_node: "n1", edge_type: "opcional" },
      { id: "e3", from_node: "n1", to_node: "n2", edge_type: "requisito" },
    ];
    const g = buildSagaGraph(nodes, edges, lookup());
    expect(g.edges.map((e) => e.accent)).toEqual(["verde", "ambar", "beige"]);
    expect(g.edges[0]).toMatchObject({ source: "n1", target: "n2", type: "principal" });
  });

  it("ordena nodos por order_no (nulls al final) y luego label — orden estable para render", () => {
    const nodes = [itemNode("nb", "b"), itemNode("na", "a", { order_no: 1 })];
    const g = buildSagaGraph(nodes, [], lookup());
    expect(g.nodes.map((n) => n.id)).toEqual(["na", "nb"]);
  });
});

describe("rol narrativo en el nodo (#167)", () => {
  it("copia el role de la membresía al nodo-ítem", () => {
    const raw: RawSagaNode[] = [
      { id: "n1", item_type: "book", item_id: "b1", child_saga_id: null,
        x: 0, y: 0, level: "principal", order_no: 1, label_override: null },
      { id: "n2", item_type: "book", item_id: "b2", child_saga_id: null,
        x: 0, y: 0, level: "principal", order_no: null, label_override: null },
    ];
    const lookup: GraphLookup = {
      members: new Map([
        ["book:b1", { itemType: "book", itemId: "b1", title: "Uno", coverUrl: null, href: "/1",
          position: 1, role: null, status: null, groupSagaId: null, year: 1990 }],
        ["book:b2", { itemType: "book", itemId: "b2", title: "Nueva Primavera", coverUrl: null, href: "/2",
          position: null, role: "precuela", status: null, groupSagaId: null, year: 2004 }],
      ]),
      groupAccent: new Map([[null, "beige"]]),
      groupName: new Map([[null, null]]),
      childNames: new Map(),
      childCovers: new Map(),
      childCounts: new Map(),
    };

    const { nodes } = buildSagaGraph(raw, [], lookup);

    expect(nodes.find((n) => n.id === "n1")!.role).toBeNull();
    expect(nodes.find((n) => n.id === "n2")!.role).toBe("precuela");
  });

  it("deja role null en un nodo-saga (una subsaga no tiene rol narrativo)", () => {
    const raw: RawSagaNode[] = [
      { id: "s1", item_type: null, item_id: null, child_saga_id: "child",
        x: 0, y: 0, level: "principal", order_no: 1, label_override: null },
    ];
    const lookup: GraphLookup = {
      members: new Map(),
      groupAccent: new Map([["child", "beige"]]),
      groupName: new Map([["child", "Hija"]]),
      childNames: new Map([["child", "Hija"]]),
      childCovers: new Map(),
      childCounts: new Map(),
    };

    const { nodes } = buildSagaGraph(raw, [], lookup);

    expect(nodes[0].role).toBeNull();
  });
});
