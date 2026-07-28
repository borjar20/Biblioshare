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

  it("dos bloques anclados al MISMO nodo no caen en su misma vertical", () => {
    // El caso de la captura del 2026-07-28 23:00 (Cosmere): «Nacidos de la Bruma.
    // Era 2» y «El Aliento de los Dioses» se alineaban los dos bajo «El Héroe de
    // las Eras», así que sus dos aristas salían del héroe por la MISMA vertical,
    // una encima de otra — se leían como una sola línea, y la más larga
    // atravesaba la portada del bloque de en medio.
    const graph: SagaGraph = {
      nodes: [
        nodo("a0", "uno", 0, 0),
        nodo("ancla", "uno", 2, 0),
        nodo("p", "dos", 0, 1),
        nodo("q", "tres", 0, 2),
      ],
      edges: [arista("ancla", "p", "requisito"), arista("ancla", "q", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "p")).toBe(2);
    expect(col(out, "q")).toBe(3);
  });

  it("dos bloques anclados a nodos DISTINTOS sí pueden compartir columna", () => {
    // El desempate es por NODO ancla, no por columna: dos aristas que salen de
    // puntos distintos no se solapan aunque acaben en la misma vertical, y
    // separarlas solo ensancharía el mapa sin que nadie gane nada.
    const graph: SagaGraph = {
      nodes: [
        nodo("a0", "uno", 0, 0),
        nodo("x", "uno", 2, 0),
        nodo("y", "uno", 2, 1),
        nodo("p", "dos", 0, 2),
        nodo("q", "tres", 0, 3),
      ],
      edges: [arista("x", "p", "requisito"), arista("y", "q", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "p")).toBe(2);
    expect(col(out, "q")).toBe(2);
  });

  it("si desempatar la vertical se saliera del tope, se acepta el solape", () => {
    // Ensanchar el mapa sin límite es peor que dos aristas juntas: el tope manda
    // sobre el desempate.
    const graph: SagaGraph = {
      nodes: [
        nodo("a0", "uno", 0, 0),
        nodo("ancla", "uno", MAX_COL_OFFSET, 0),
        nodo("p", "dos", 0, 1),
        nodo("q", "tres", 0, 2),
      ],
      edges: [arista("ancla", "p", "requisito"), arista("ancla", "q", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "p")).toBe(MAX_COL_OFFSET);
    expect(col(out, "q")).toBe(MAX_COL_OFFSET);
  });

  it("con un número PAR de deltas que además alcanza el tope: mediana 3.5 → redondea a 4 = MAX_COL_OFFSET", () => {
    // Caso real de producción (Cosmere, "Novelas secretas"): la obra con
    // ventana está en su columna LOCAL 0, y sus dos anclas ya están colocadas
    // arriba, en las columnas 3 y 4. Deltas [3, 4] → mediana (3+4)/2 = 3.5 →
    // Math.round → 4, que es exactamente MAX_COL_OFFSET: cubre de una vez la
    // rama PAR de mediana(), el redondeo de un .5, y el recorte al tope.
    const graph: SagaGraph = {
      // OJO con los fixtures: la normalización final resta el mínimo `x` de
      // TODO el grafo, así que cada bloque de arriba necesita un nodo en la
      // columna 0 (p0, q0) o el desplazamiento se perdería al normalizar.
      nodes: [
        nodo("p0", "uno", 0, 0),
        nodo("p", "uno", 3, 0),
        nodo("q0", "dos", 0, 1),
        nodo("q", "dos", 4, 1),
        nodo("x", "tres", 0, 2),
      ],
      edges: [arista("p", "x", "requisito"), arista("q", "x", "requisito")],
    };
    expect(col(alignRowsToLongEdges(graph), "x")).toBe(MAX_COL_OFFSET);
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

  it("dos sueltas de la misma fila se ordenan por la columna de su ancla", () => {
    // Las sueltas no tienen hueco, así que su orden entre ellas era el del
    // título: arbitrario respecto a dónde están sus anclas. Ordenarlas por la
    // columna del ancla evita que sus aristas se crucen entre sí.
    const graph: SagaGraph = {
      nodes: [
        nodo("izq", "uno", 0, 0),
        nodo("der", "uno", 2, 0),
        // `a` va antes que `b` por título, pero el ancla de `a` está a la
        // derecha y la de `b` a la izquierda: sus aristas se cruzan.
        { ...nodo("a", "uno", 0, 1), orderNo: null },
        { ...nodo("b", "uno", 1, 1), orderNo: null },
      ],
      edges: [arista("der", "a", "requisito"), arista("izq", "b", "requisito")],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "b")).toBe(0);
    expect(col(out, "a")).toBe(1);
  });

  it("dos sueltas sin ancla desempatan por título, no por el orden en que llegaron", () => {
    // El fixture baraja adrede el orden de inserción (b antes que a) con
    // columnas al revés del alfabético: si el resultado saliera IGUAL que el
    // orden de entrada (col(b)=0, col(a)=1), lo que se estaría viendo sería un
    // sort estable que conserva la posición de llegada, no un desempate por
    // título. Con desempate por título de verdad, "a" tiene que quedar
    // siempre antes que "b" pase lo que pase con el orden de inserción.
    const graph: SagaGraph = {
      nodes: [
        nodo("cadena", "uno", 0, 0),
        { ...nodo("b", "uno", 1, 1), orderNo: null },
        { ...nodo("a", "uno", 0, 1), orderNo: null },
      ],
      edges: [],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(1);
  });

  it("las sueltas de dos FILAS (`y`) distintas no se mezclan entre sí", () => {
    // El nombre importaba: `filasDeSueltas` agrupa solo por `y`, nunca mira
    // `groupSagaId` (dos bloques con sus propias sueltas no pueden compartir
    // fila — ver el comentario de `filasDeSueltas` en layout-map.ts), así que
    // lo que esta prueba comprueba de verdad es separación de FILA, no de
    // bloque. Con `y` iguales para "a" y "b" habría dado el mismo resultado
    // aunque el código agrupara por bloque en vez de por fila.
    const graph: SagaGraph = {
      nodes: [
        { ...nodo("a", "uno", 0, 0), orderNo: null },
        { ...nodo("b", "dos", 0, 1), orderNo: null },
      ],
      edges: [],
    };
    const out = alignRowsToLongEdges(graph);
    expect(col(out, "a")).toBe(0);
    expect(col(out, "b")).toBe(0);
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
