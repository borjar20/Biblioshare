import { describe, expect, it } from "vitest";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { DetailMember } from "./types";
import { publicationSections } from "./shelf-sections";

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
