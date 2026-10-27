import { describe, expect, it } from "vitest";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { DetailMember } from "./types";
import type { MemberGroup } from "./group-members";
import { curatedRouteSections, expandRouteKeys, publicationSections } from "./shelf-sections";

function node(id: string, label: string): SagaGraphNode {
  return {
    id, kind: "item", x: 0, y: 0, level: "principal", orderNo: null, label,
    accent: "terracota", status: null, role: null, coverUrl: null, covers: [],
    href: `/libro/${id}`, memberCount: null, groupSagaId: null, groupName: null,
    step: null, tandem: null, windowReason: null, optional: false, skipped: false,
    ownerSagaId: "root",
  };
}

function member(itemId: string, title: string, year: number | null): DetailMember {
  return {
    itemType: "book", itemId, title, coverUrl: null, href: `/libro/${itemId}`,
    position: null, role: null, placement: null, optional: false,
    status: null, groupSagaId: null, ownerSagaId: "root", year, skipped: false,
  };
}

describe("publicationSections", () => {
  it("devuelve una sección con las obras por año de publicación y numeradas", () => {
    const graph: SagaGraph = {
      nodes: [node("i:book:b", "Dos"), node("i:book:a", "Uno"), node("i:book:c", "Sin año")],
      edges: [],
    };
    const members = [member("b", "Dos", 1970), member("a", "Uno", 1965), member("c", "Sin año", null)];

    const [section, ...rest] = publicationSections(graph, members);

    expect(rest).toHaveLength(0);
    expect(section.groupSagaId).toBeNull();
    expect(section.rows.map((r) => (r.kind === "entry" ? [r.no, r.node.label] : null))).toEqual([
      [1, "Uno"],
      [2, "Dos"],
      [3, "Sin año"],
    ]);
  });

  it("sin nodos devuelve una lista vacía", () => {
    expect(publicationSections({ nodes: [], edges: [] }, [])).toEqual([]);
  });

  it("omite un miembro sin nodo en el grafo en lugar de inventarlo", () => {
    const graph: SagaGraph = { nodes: [node("i:book:a", "Uno")], edges: [] };
    const [section] = publicationSections(graph, [member("a", "Uno", 1965), member("z", "Huérfano", 1990)]);
    expect(section.rows).toHaveLength(1);
  });
});

describe("curatedRouteSections", () => {
  // Itinerario cuyo ÚNICO paso es un bloque-subsaga (el «la-guardia» del Universo
  // QA). `deriveSagaMap` ignora las claves `s:<uuid>`, así que sin expandir el
  // bloque la balda salía sin obras (modo `empty`).
  const sub = (itemId: string, title: string, position: number): DetailMember => ({
    ...member(itemId, title, null),
    position,
    placement: "fijo",
    groupSagaId: "sub",
    ownerSagaId: "sub",
  });
  // Insertadas al revés de su `position` para que el orden lo ponga la curación.
  const groups: MemberGroup[] = [
    { sagaId: "sub", name: "La Guardia", accent: "verde", members: [sub("b", "Segunda", 2), sub("a", "Primera", 1)], positionInParent: 1, placementInParent: "fijo" },
  ];
  const detail = {
    groups,
    windows: {},
    orderSagas: [
      { id: "root", name: "Universo", parentSagaId: null, positionInParent: null, placementInParent: null },
      { id: "sub", name: "La Guardia", parentSagaId: "root", positionInParent: 1, placementInParent: "fijo" as const },
    ],
    orderMemberships: [
      { sagaId: "sub", itemType: "book" as const, itemId: "b", position: 2, placement: "fijo" as const },
      { sagaId: "sub", itemType: "book" as const, itemId: "a", position: 1, placement: "fijo" as const },
    ],
  };

  it("un itinerario de un solo bloque da las obras del bloque en su orden curado", () => {
    const sections = curatedRouteSections(detail, ["s:sub"], { authenticated: true, showOptional: true });
    const labels = sections.flatMap((sec) => sec.rows.map((r) => (r.kind === "entry" ? r.node.label : null)));
    expect(labels).toEqual(["Primera", "Segunda"]);
  });

  it("expandRouteKeys respeta el orden del itinerario y no repite una obra ya nombrada", () => {
    const order = (id: string) => (id === "sub" ? ["book:a", "book:b"] : []);
    expect(expandRouteKeys(["i:book:b", "s:sub", "i:movie:z"], order)).toEqual(["i:book:b", "i:book:a", "i:movie:z"]);
  });
});
