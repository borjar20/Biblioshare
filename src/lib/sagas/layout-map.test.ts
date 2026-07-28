import { describe, expect, it } from "vitest";
import { NODE_STEP_X, NODE_STEP_Y } from "./graph-metrics";
import { alignRowsToLongEdges, MAX_COL_OFFSET } from "./layout-map";
import type { SagaGraph, SagaGraphEdge, SagaGraphNode } from "./map-types";

const nodo = (id: string, bloque: string | null, col: number, row: number): SagaGraphNode => ({
  id,
  kind: "item",
  x: col * NODE_STEP_X,
  y: row * NODE_STEP_Y,
  level: "principal",
  // Nodo de CADENA por defecto: `orderNo` no nulo. Una obra SUELTA (sin hueco)
  // es la que lleva `orderNo: null`, y esa es la señal por la que la Task 7 las
  // reconoce para reordenarlas. Los tests de sueltas lo sobrescriben.
  orderNo: 0,
  label: id,
  accent: "beige",
  status: null,
  role: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: bloque,
  groupName: bloque,
  step: null,
  tandem: null,
  windowReason: null,
  optional: false,
  skipped: false,
  ownerSagaId: "owner",
});

const arista = (source: string, target: string, type: SagaGraphEdge["type"]): SagaGraphEdge => ({
  id: `${type}:${source}->${target}`,
  source,
  target,
  type,
  accent: "beige",
});

const col = (g: SagaGraph, id: string) => g.nodes.find((n) => n.id === id)!.x / NODE_STEP_X;

describe("alignRowsToLongEdges", () => {
  it("una arista de ventana alinea el bloque de abajo bajo su ancla", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "uno", 1, 0), nodo("l", "libre", 0, 1)],
      edges: [arista("b", "l", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "l")).toBe(1);
    // El de arriba no se mueve: es el primero que se coloca.
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(1);
  });

  it("una arista de cadena NO alinea: la cadena se queda compacta en la columna 0", () => {
    // Es lo que protege el modelo compacto que documenta `derive-map.ts:113`
    // («una fila por bloque, compacta»). Alinear por `principal` devuelve la
    // escalera diagonal que aquella decisión mató.
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "uno", 1, 0), nodo("c", "dos", 0, 1)],
      edges: [arista("b", "c", "principal")],
    };
    expect(col(alignRowsToLongEdges(graph), "c")).toBe(0);
  });

  it("un salto de itinerario también alinea", () => {
    // OJO con los fixtures: la normalización final resta el mínimo `x` de TODO
    // el grafo, así que un bloque de arriba que empiece en la columna 2 haría
    // que al final todo se desplazara de vuelta y el test mediría 0. Un bloque
    // real SIEMPRE tiene un nodo en la columna 0 (`x` se reinicia por bloque),
    // así que los fixtures lo reproducen con un nodo ancla en la columna 0.
    const graph: SagaGraph = {
      nodes: [nodo("a0", "uno", 0, 0), nodo("a", "uno", 2, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "itinerario")],
    };
    expect(col(alignRowsToLongEdges(graph), "z")).toBe(2);
  });

  it("mueve el bloque ENTERO: un tándem no se desapila", () => {
    // Las dos obras de un tándem comparten columna en filas distintas. Mover una
    // fila suelta las separa y deshace lo que arregló la fase 2.
    const graph: SagaGraph = {
      nodes: [
        nodo("a0", "uno", 0, 0),
        nodo("a", "uno", 1, 0),
        nodo("t1", "dos", 0, 1),
        nodo("t2", "dos", 0, 2),
        nodo("suelta", "dos", 0, 3),
      ],
      edges: [arista("a", "t1", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "t1")).toBe(1);
    expect(col(out, "t2")).toBe(1);
    expect(col(out, "suelta")).toBe(1);
  });

  it("con varias anclas aplica la MEDIANA, no la media", () => {
    // Una mediana aguanta un ancla rara en un extremo; una media se la lleva.
    // Deltas: 1, 1 y 4 → mediana 1. Con media saldría 2.
    const graph: SagaGraph = {
      nodes: [
        nodo("p0", "uno", 0, 0),
        nodo("p", "uno", 1, 0),
        nodo("q", "dos", 1, 1),
        nodo("r", "tres", 4, 2),
        nodo("x", "cuatro", 0, 3),
      ],
      edges: [arista("p", "x", "requisito"), arista("q", "x", "requisito"), arista("r", "x", "requisito")],
    };
    expect(col(alignRowsToLongEdges(graph), "x")).toBe(1);
  });

  it("el offset se recorta a MAX_COL_OFFSET", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a0", "uno", 0, 0), nodo("a", "uno", 9, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    expect(col(alignRowsToLongEdges(graph), "z")).toBe(MAX_COL_OFFSET);
  });

  it("un ancla a la IZQUIERDA no empuja el bloque a columnas negativas", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("z", "dos", 3, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    // El offset es absoluto y se recorta a [0, MAX_COL_OFFSET]: el bloque de
    // abajo se queda donde estaba, no se arrastra a la izquierda del lienzo.
    expect(col(alignRowsToLongEdges(graph), "z")).toBe(3);
  });

  it("normaliza: el mapa vuelve a empezar en la columna 0", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 2, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(Math.min(...out.nodes.map((n) => n.x))).toBe(0);
  });

  it("una arista larga DENTRO del mismo bloque no lo mueve", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "uno", 3, 1)],
      edges: [arista("b", "a", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(3);
  });

  it("sin aristas largas el grafo sale como entró", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 0, 0), nodo("b", "dos", 1, 1)],
      edges: [arista("a", "b", "principal")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(out.nodes.map((n) => n.x)).toEqual(graph.nodes.map((n) => n.x));
  });

  it("un grafo vacío no revienta", () => {
    expect(alignRowsToLongEdges({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });

  it("el grupo Nexo (bloque null) se mueve entero y no se mezcla con un bloque con id", () => {
    // `groupSagaId: null` es el grupo de miembros directos («Nexo»). Antes se
    // distinguía con un centinela de cadena; ahora es un `null` legítimo como
    // clave de bloque, y no debe confundirse con "nodo no encontrado" ni
    // mezclarse con las obras de un bloque real.
    const graph: SagaGraph = {
      nodes: [
        nodo("a0", "uno", 0, 0),
        nodo("a", "uno", 1, 0),
        nodo("n1", null, 0, 1),
        nodo("n2", null, 1, 1),
      ],
      edges: [arista("a", "n1", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    // El grupo Nexo entero se desplaza junto con su ancla...
    expect(col(out, "n1")).toBe(1);
    expect(col(out, "n2")).toBe(2);
    // ...y el bloque con id que sigue arriba no se ve afectado.
    expect(col(out, "a0")).toBe(0);
    expect(col(out, "a")).toBe(1);
  });

  it("no muta el grafo que recibe", () => {
    const graph: SagaGraph = {
      nodes: [nodo("a", "uno", 2, 0), nodo("z", "dos", 0, 1)],
      edges: [arista("a", "z", "requisito")],
    };
    alignRowsToLongEdges(graph);
    expect(graph.nodes.find((n) => n.id === "z")!.x).toBe(0);
  });
});
