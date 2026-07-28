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
  tandem: null,
  windowReason: null,
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

  // Estos dos tests afirmaban que un nexo unido a la columna por aristas
  // `requisito` salía como PUENTE. Desde la fase 1 del timeline con estados
  // (2026-07-28) ya no: una arista `requisito` que ENTRA en un nodo sin
  // `orderNo` es, en el único grafo que produce el producto (`deriveSagaMap`),
  // el ancla «después de» de una ventana — no hay ninguna otra cosa que la
  // emita. Así que ese nodo pasa a ser fila `window`, que además enseña sus
  // anclas; el puente no las enseñaba. Ver la issue del `bridge` casi
  // inalcanzable.
  it("un nexo con ancla «después de» sale como ventana colocada tras su ancla, no como puente", () => {
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
    // Dos secciones (g1, g2) y la ventana DENTRO de la primera, tras «a».
    expect(tl).toHaveLength(2);
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "window"]);
    const win = tl[0].rows[1];
    if (win.kind !== "window") throw new Error("se esperaba una ventana");
    expect(win.node.id).toBe("hub");
    expect(win.after?.id).toBe("a");
  });

  it("dos nexos anclados a la misma fila salen los dos como ventanas, tras esa fila", () => {
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
    expect(tl).toHaveLength(2);
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "window", "window"]);
  });

  it("el puente sobrevive para lo que NO es ventana: un nexo unido por una arista de cadena", () => {
    // Único camino que queda al puente: una arista que no es de ventana
    // (`principal`) tocando un nodo sin grupo y sin orden.
    const hub = node("hub", { groupSagaId: null, groupName: null, accent: "beige" });
    const tl = deriveTimeline(
      graph(
        [
          node("a", { orderNo: 1 }),
          node("c", { orderNo: 2, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
          hub,
        ],
        [{ id: "e1", source: "a", target: "hub", type: "principal", accent: "beige" }],
      ),
    );
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

describe("deriveTimeline · tándem", () => {
  it("dos obras que comparten hueco producen UNA fila tandem con las dos", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0 }),
        node("t1", { orderNo: 1, label: "Imperio de Tormentas" }),
        node("t2", { orderNo: 1, label: "Torre del Alba" }),
        node("z", { orderNo: 2 }),
      ]),
    );
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "tandem", "entry"]);
    const tandem = tl[0].rows[1];
    if (tandem.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(tandem.nodes.map((n) => n.id)).toEqual(["t1", "t2"]);
    expect(tandem.no).toBe(2);
    expect(tandem.mode).toBeNull();
    expect(tandem.note).toBeNull();
  });

  it("un tándem no cruza subsagas: el hueco pertenece a un bloque", () => {
    // Defensa del invariante, no capricho: si dos nodos con el mismo orderNo
    // tuvieran groupSagaId distinto, agruparlos fundiría dos secciones. Se
    // agrupa SOLO dentro de la sección.
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0 }),
        node("b", { orderNo: 0, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
      ]),
    );
    expect(tl).toHaveLength(2);
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry"]);
    expect(tl[1].rows.map((r) => r.kind)).toEqual(["entry"]);
  });

  it("modo route: dos pasos consecutivos que comparten hueco son un tándem", () => {
    const tl = deriveTimeline(
      graph([
        node("t1", { orderNo: 1, step: 1 }),
        node("t2", { orderNo: 1, step: 2 }),
        node("z", { orderNo: 2, step: 3 }),
      ]),
      { spine: "route" },
    );
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["tandem", "entry"]);
    const tandem = tl[0].rows[0];
    if (tandem.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(tandem.no).toBe(1);
  });

  it("modo route: si el itinerario mete algo en medio del hueco, NO hay tándem", () => {
    const tl = deriveTimeline(
      graph([
        node("t1", { orderNo: 1, step: 1 }),
        node("z", { orderNo: 2, step: 2 }),
        node("t2", { orderNo: 1, step: 3 }),
      ]),
      { spine: "route" },
    );
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "entry", "entry"]);
  });

  it("las ramas de las obras del tándem cuelgan de la fila del tándem", () => {
    const spin = node("spin", { orderNo: null, label: "Spin" });
    const tl = deriveTimeline(
      graph(
        [node("t1", { orderNo: 0 }), node("t2", { orderNo: 0 }), spin],
        [{ id: "e", source: "t1", target: "spin", type: "opcional", accent: "ambar" }],
      ),
    );
    const tandem = tl[0].rows[0];
    if (tandem.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(tandem.branches.map((b) => b.node.id)).toEqual(["spin"]);
  });
});

describe("deriveTimeline · ventana", () => {
  const withWindow = (edges: SagaGraph["edges"]) =>
    deriveTimeline(
      graph(
        [
          node("a", { orderNo: 0, label: "Uno" }),
          node("b", { orderNo: 1, label: "Dos" }),
          node("c", { orderNo: 2, label: "Tres" }),
          node("w", { orderNo: null, label: "Ventana" }),
        ],
        edges,
      ),
    );

  /** Etiqueta cada fila para comparar el ORDEN de la columna de un vistazo. */
  const shape = (tl: ReturnType<typeof deriveTimeline>) =>
    tl[0].rows.map((r) => (r.kind === "window" ? "window" : r.kind === "entry" ? r.node.id : r.kind));

  it("con ancla «después de», la fila cae JUSTO DESPUÉS de esa fila", () => {
    const tl = withWindow([{ id: "e", source: "a", target: "w", type: "requisito", accent: "beige" }]);
    expect(shape(tl)).toEqual(["a", "window", "b", "c"]);
    const win = tl[0].rows[1];
    if (win.kind !== "window") throw new Error("se esperaba una ventana");
    expect(win.after?.id).toBe("a");
    expect(win.before).toBeNull();
    expect(win.no).toBeNull();
    expect(win.reason).toBeNull();
    expect(win.track).toBeNull();
  });

  it("con las dos anclas, manda el «después de»", () => {
    const tl = withWindow([
      { id: "e1", source: "a", target: "w", type: "requisito", accent: "beige" },
      { id: "e2", source: "w", target: "c", type: "opcional", accent: "ambar" },
    ]);
    expect(shape(tl)).toEqual(["a", "window", "b", "c"]);
    const win = tl[0].rows[1];
    if (win.kind !== "window") throw new Error("se esperaba una ventana");
    expect(win.after?.id).toBe("a");
    expect(win.before?.id).toBe("c");
  });

  it("con solo «antes de», la fila cae JUSTO ANTES de esa fila", () => {
    const tl = withWindow([{ id: "e", source: "w", target: "c", type: "opcional", accent: "ambar" }]);
    expect(shape(tl)).toEqual(["a", "b", "window", "c"]);
  });

  it("sin ancla que resuelva, sigue cayendo a rama como hoy", () => {
    // Arista de la columna HACIA el nodo con tipo `opcional`: no es una ventana
    // (una ventana `antes de` sale DEL sujeto), es el mecanismo de ramas de #167.
    const tl = withWindow([{ id: "e", source: "a", target: "w", type: "opcional", accent: "ambar" }]);
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "entry", "entry"]);
    const rowA = tl[0].rows[0];
    if (rowA.kind !== "entry") throw new Error("se esperaba entry");
    expect(rowA.branches.map((b) => b.node.id)).toEqual(["w"]);
  });

  it("integración: deriveSagaMap → deriveTimeline coloca la ventana tras su ancla", () => {
    const w = (id: string, position: number | null, placement: "fijo" | "libre"): DetailMember => ({
      itemType: "book",
      itemId: id,
      title: id,
      coverUrl: null,
      href: `/libro/${id}`,
      position,
      role: null,
      placement,
      optional: false,
      status: null,
      groupSagaId: "saga-Era",
      ownerSagaId: "owner",
      year: null,
    });
    const groups: MemberGroup[] = [
      {
        sagaId: "saga-Era",
        name: "Era",
        accent: "beige",
        members: [w("A", 1, "fijo"), w("B", 2, "fijo"), w("L", null, "libre")],
        positionInParent: 1,
        placementInParent: "fijo",
      },
    ];
    const derived = deriveSagaMap(
      groups,
      { "i:book:L": { afterTitle: "A", beforeTitle: null, afterKey: "i:book:A", beforeKey: null, reason: null } },
      { groupAccent: new Map(), groupName: new Map() },
    );
    const tl = deriveTimeline(derived);
    expect(tl[0].rows.map((r) => (r.kind === "window" ? "window" : r.kind === "entry" ? r.node.id : r.kind))).toEqual([
      "i:book:A",
      "window",
      "i:book:B",
    ]);
  });
});

describe("rol narrativo en las ramas (#167)", () => {
  it("la rama conserva el role del nodo, y edgeType sigue siendo el de la arista", () => {
    const graph: SagaGraph = {
      nodes: [
        { id: "n1", kind: "item", x: 0, y: 0, level: "principal", orderNo: 1,
          label: "Uno", accent: "beige", status: null, role: null, coverUrl: null,
          covers: [], href: "/1", memberCount: null, groupSagaId: "g1", groupName: "G", step: null, tandem: null, windowReason: null },
        { id: "n2", kind: "item", x: 0, y: 0, level: "principal", orderNo: null,
          label: "Spin", accent: "beige", status: null, role: "spin_off", coverUrl: null,
          covers: [], href: "/2", memberCount: null, groupSagaId: "g1", groupName: "G", step: null, tandem: null, windowReason: null },
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

describe("deriveTimeline · metadatos del tándem (fase 2)", () => {
  const meta = { mode: "indistinto" as const, note: "cualquiera de los dos" };

  it("la fila tandem toma modo y nota del hueco", () => {
    const tl = deriveTimeline(graph([node("t1", { orderNo: 0, tandem: meta }), node("t2", { orderNo: 0, tandem: meta })]));
    const row = tl[0].rows[0];
    if (row.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(row.mode).toBe("indistinto");
    expect(row.note).toBe("cualquiera de los dos");
  });

  it("en la columna por pasos también", () => {
    const tl = deriveTimeline(
      graph([
        node("t1", { orderNo: 0, step: 1, tandem: meta }),
        node("t2", { orderNo: 0, step: 2, tandem: meta }),
      ]),
      { spine: "route" },
    );
    const row = tl[0].rows[0];
    if (row.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(row.mode).toBe("indistinto");
  });

  it("sin metadatos declarados, la fila sigue siendo tándem con mode/note a null", () => {
    const tl = deriveTimeline(graph([node("t1", { orderNo: 0 }), node("t2", { orderNo: 0 })]));
    const row = tl[0].rows[0];
    if (row.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(row.mode).toBeNull();
    expect(row.note).toBeNull();
  });
});

// ── Fase 3: el motivo llega a la fila ────────────────────────────────────────
describe("motivo de la fila de ventana (fase 3)", () => {
  it("la fila de ventana lleva el motivo del nodo sujeto", () => {
    const tl = deriveTimeline(
      graph(
        [node("o1", { orderNo: 0 }), node("w", { orderNo: null, windowReason: "spoiler" })],
        [{ id: "e1", source: "o1", target: "w", type: "requisito", accent: "beige" }],
      ),
    );
    const fila = tl[0].rows.find((r) => r.kind === "window")!;
    expect(fila.kind === "window" && fila.reason).toBe("spoiler");
  });

  it("sin motivo declarado la fila lo lleva a null, no a undefined", () => {
    const tl = deriveTimeline(
      graph(
        [node("o1", { orderNo: 0 }), node("w", { orderNo: null })],
        [{ id: "e1", source: "o1", target: "w", type: "requisito", accent: "beige" }],
      ),
    );
    const fila = tl[0].rows.find((r) => r.kind === "window")!;
    expect(fila.kind === "window" && fila.reason).toBeNull();
  });
});
