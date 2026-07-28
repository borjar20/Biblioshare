import { describe, expect, it } from "vitest";
import { deriveTimeline, scaleNodes, sortByPublication } from "./derive-timeline";
import { deriveSagaMap } from "./derive-map";
import type { MemberGroup } from "./group-members";
import type { SagaGraph, SagaGraphNode } from "./map-types";
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
  role: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: "g1",
  groupName: "Era Uno",
  step: null,
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

  it("dos puentes anclados a la misma sección conservan el orden alfabético", () => {
    const hubA = node("hubA", { groupSagaId: null, groupName: null, accent: "beige", label: "Alfa Nexo" });
    const hubB = node("hubB", { groupSagaId: null, groupName: null, accent: "beige", label: "Beta Nexo" });
    const tl = deriveTimeline(
      graph(
        [
          node("a", { orderNo: 1 }),
          node("c", { orderNo: 2, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
          hubB,
          hubA,
        ],
        [
          { id: "e1", source: "a", target: "hubA", type: "requisito", accent: "beige" },
          { id: "e2", source: "a", target: "hubB", type: "requisito", accent: "beige" },
        ],
      ),
    );
    expect(tl).toHaveLength(4);
    expect(tl[1].rows[0]).toMatchObject({ kind: "bridge", node: { id: "hubA" } });
    expect(tl[2].rows[0]).toMatchObject({ kind: "bridge", node: { id: "hubB" } });
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

describe("deriveTimeline · numeración y columna por pasos", () => {
  it("modo curation: el número que se pinta es 1..N, no el orderNo crudo (que empieza en 0)", () => {
    const tl = deriveTimeline(graph([node("a", { orderNo: 0 }), node("b", { orderNo: 1 })]));
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.no)).toEqual([1, 2]);
  });

  it("modo route: la columna son los pasos, en su orden, aunque contradiga la curación", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0, step: 3 }),
        node("b", { orderNo: 1, step: 1 }),
        node("c", { orderNo: 2, step: 2 }),
      ]),
      { spine: "route" },
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.node.id)).toEqual(["b", "c", "a"]);
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.no)).toEqual([1, 2, 3]);
  });

  it("modo route: una sola sección, sin cabecera de subsaga", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0, step: 1 }),
        node("c", { orderNo: 1, step: 2, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
      ]),
      { spine: "route" },
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].groupName).toBeNull();
    expect(tl[0].groupSagaId).toBeNull();
  });

  it("modo route: un paso que no resuelve a nodo no produce fila, y el resto conserva SU número", () => {
    // El paso 2 es una obra borrada: deriveSagaMap nunca le puso `step` a nadie.
    const tl = deriveTimeline(graph([node("a", { orderNo: 0, step: 1 }), node("c", { orderNo: 1, step: 3 })]), {
      spine: "route",
    });
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.no)).toEqual([1, 3]);
  });

  it("modo route: lo que el itinerario no nombra no aparece (ni rama ni puente)", () => {
    const tl = deriveTimeline(
      graph(
        [
          node("a", { orderNo: 0, step: 1 }),
          node("spin", { orderNo: null }),
          node("hub", { orderNo: null, groupSagaId: null, groupName: null, accent: "beige" }),
        ],
        [{ id: "e", source: "a", target: "spin", type: "opcional", accent: "ambar" }],
      ),
      { spine: "route" },
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].rows).toHaveLength(1);
  });

  it("modo curation por defecto: sin opts se comporta como hoy", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0 }),
        node("c", { orderNo: 1, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
      ]),
    );
    expect(tl).toHaveLength(2);
  });
});

describe("rol narrativo en las ramas (#167)", () => {
  it("la rama conserva el role del nodo, y edgeType sigue siendo el de la arista", () => {
    const graph: SagaGraph = {
      nodes: [
        { id: "n1", kind: "item", x: 0, y: 0, level: "principal", orderNo: 1,
          label: "Uno", accent: "beige", status: null, role: null, coverUrl: null,
          covers: [], href: "/1", memberCount: null, groupSagaId: "g1", groupName: "G", step: null },
        { id: "n2", kind: "item", x: 0, y: 0, level: "principal", orderNo: null,
          label: "Spin", accent: "beige", status: null, role: "spin_off", coverUrl: null,
          covers: [], href: "/2", memberCount: null, groupSagaId: "g1", groupName: "G", step: null },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", type: "opcional", accent: "ambar" }],
    };

    const sections = deriveTimeline(graph);
    const entry = sections[0].rows[0];
    if (entry.kind !== "entry") throw new Error("se esperaba una entry");

    expect(entry.branches).toHaveLength(1);
    expect(entry.branches[0].node.role).toBe("spin_off");
    expect(entry.branches[0].edgeType).toBe("opcional");
  });
});

describe("sortByPublication", () => {
  const m = (itemId: string, year: number | null, title = itemId): DetailMember => ({
    itemType: "book", itemId, title, coverUrl: null, href: `/libro/${itemId}`,
    position: null, role: null, placement: null, optional: false, status: null, groupSagaId: null, ownerSagaId: "owner", year,
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

// Integración (fase 3, Task 2): en producción `deriveTimeline` ya no recibe un
// grafo pintado a mano — lo construye `deriveSagaMap` a partir de lo curado
// (get-saga-detail.ts). Esta prueba junta las dos piezas de verdad, en vez de
// montar un `SagaGraph` a mano como hacen las de arriba: es la que demuestra
// que encajan, algo que ninguna de las dos suites por separado cubre.
describe("integración: deriveSagaMap → deriveTimeline", () => {
  const work = (id: string, position: number): DetailMember => ({
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

  const block = (name: string, positionInParent: number, works: DetailMember[]): MemberGroup => {
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

  it("dos bloques curados producen dos secciones con sus filas en el orden curado", () => {
    const groups: MemberGroup[] = [
      block("Era Uno", 1, [work("A", 1), work("B", 2)]),
      block("Era Dos", 2, [work("C", 1), work("D", 2)]),
    ];
    const derivedGraph = deriveSagaMap(groups, {}, { groupAccent: new Map(), groupName: new Map() });

    const tl = deriveTimeline(derivedGraph);

    expect(tl).toHaveLength(2);
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.node.id)).toEqual(["i:book:A", "i:book:B"]);
    expect(tl[1].rows.map((r) => r.kind === "entry" && r.node.id)).toEqual(["i:book:C", "i:book:D"]);
  });
});
