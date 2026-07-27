import { describe, expect, it } from "vitest";
import { deriveSagaMap, type MapLookup } from "./derive-map";
import type { MemberGroup } from "./group-members";
import type { DetailMember } from "./types";

// Helpers: misma forma de MemberGroup/DetailMember que group-members.test.ts —
// reutilizada, no reinventada. `block`/`freeBlock` fijan el sagaId del bloque
// como `saga-<nombre>` (así las pruebas pueden referenciar su clave de ventana
// `s:saga-<nombre>` sin depender de un uuid) y propagan ese sagaId a
// `groupSagaId` en cada miembro, igual que hace `groupMembers` de verdad.

const work = (id: string, position: number | null): DetailMember => ({
  itemType: "book",
  itemId: id,
  title: id,
  coverUrl: null,
  href: `/libro/${id}`,
  position,
  role: null,
  placement: "fijo",
  optional: false,
  status: null,
  groupSagaId: null,
  ownerSagaId: "owner",
  year: null,
});

const block = (name: string, positionInParent: number | null, works: DetailMember[]): MemberGroup => {
  const sagaId = `saga-${name}`;
  return {
    sagaId,
    name,
    accent: "beige",
    members: works.map((w) => ({ ...w, groupSagaId: sagaId })),
    positionInParent,
    placementInParent: "fijo",
  };
};

const freeBlock = (name: string, works: DetailMember[]): MemberGroup => {
  const sagaId = `saga-${name}`;
  return {
    sagaId,
    name,
    accent: "beige",
    members: works.map((w) => ({ ...w, groupSagaId: sagaId })),
    positionInParent: null,
    placementInParent: "libre",
  };
};

const groups = (list: MemberGroup[]): MemberGroup[] => list;

const lookup = (): MapLookup => ({ groupAccent: new Map(), groupName: new Map() });

describe("deriveSagaMap", () => {
  it("un bloque colocado da una cadena de obras, no un nodo de bloque", () => {
    const map = deriveSagaMap(groups([block("Era 1", 1, [work("A", 1), work("B", 2)])]), {}, lookup());
    expect(map.nodes.map((n) => n.id)).toEqual(["i:book:A", "i:book:B"]);
    expect(map.nodes.every((n) => n.kind === "item")).toBe(true);
    expect(map.edges).toEqual([
      expect.objectContaining({ source: "i:book:A", target: "i:book:B", type: "principal" }),
    ]);
  });

  it("un tándem son dos nodos en la misma columna", () => {
    const map = deriveSagaMap(groups([block("B", 1, [work("A", 1), work("B", 1)])]), {}, lookup());
    const [a, b] = map.nodes;
    expect(a.x).toBe(b.x);
    expect(a.orderNo).toBe(b.orderNo);
  });

  it("cada bloque ocupa su propia fila", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("B", 1)])]),
      {}, lookup(),
    );
    expect(map.nodes.find((n) => n.id === "i:book:A")!.y).not.toBe(
      map.nodes.find((n) => n.id === "i:book:B")!.y,
    );
  });

  it("una ventana con ancla de obra es una arista que cruza", () => {
    // `after` = requisito y entra; `before` = opcional y sale.
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), freeBlock("Libre", [work("L", 1)])]),
      { "s:saga-Libre": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toContainEqual(
      expect.objectContaining({ source: "i:book:A", target: "i:book:L", type: "requisito" }),
    );
  });

  it("un ancla que apunta a un BLOQUE se conecta a su última obra, no al bloque", () => {
    // «A partir de Era 1» significa cuando Era 1 se ha terminado: el extremo es
    // su ÚLTIMA obra. Un bloque no es un nodo, así que no hay a qué apuntar si no.
    const map = deriveSagaMap(
      groups([block("Era 1", 1, [work("A", 1), work("B", 2)]), freeBlock("Libre", [work("L", 1)])]),
      { "s:saga-Libre": { afterKey: "s:saga-Era 1", afterTitle: "Era 1", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toContainEqual(
      expect.objectContaining({ source: "i:book:B", target: "i:book:L", type: "requisito" }),
    );
  });

  it("una entrada libre sin ventana queda suelta, sin aristas que la unan al resto", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), freeBlock("Libre", [work("L", 1)])]),
      {}, lookup(),
    );
    expect(map.edges.some((e) => e.source === "i:book:L" || e.target === "i:book:L")).toBe(false);
  });

  it("una ventana cuyo extremo no está en el mapa no pinta arista", () => {
    const map = deriveSagaMap(
      groups([freeBlock("Libre", [work("L", 1)])]),
      { "s:saga-Libre": { afterKey: "i:book:fantasma", afterTitle: "F", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toEqual([]);
  });

  it("una saga sin nada curado no da mapa", () => {
    expect(deriveSagaMap([], {}, lookup())).toEqual({ nodes: [], edges: [] });
  });
});
