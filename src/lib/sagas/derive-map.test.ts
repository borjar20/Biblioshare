import { describe, expect, it } from "vitest";
import { createCuratedOrder } from "./curated-order";
import { deriveSagaMap, NODE_STEP_Y, type MapLookup } from "./derive-map";
import { groupMembers, type MemberGroup } from "./group-members";
import type { DetailMember, SagaChildRef } from "./types";

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

// A diferencia de `work()`, que fija `placement: "fijo"` a machamartillo, esta
// obra no tiene hueco (`position: null`, lo impone el CHECK
// saga_items_placement_position): `libre` por defecto, o `null` (sin
// clasificar) si se pasa explícitamente — los dos casos que la revisión pide
// cubrir (hallazgo 1).
const looseWork = (id: string, placement: DetailMember["placement"] = "libre"): DetailMember => ({
  ...work(id, null),
  placement,
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

  it("un tándem son dos nodos en la misma columna, APILADOS, no en el mismo punto", () => {
    // Comparten columna y `orderNo` porque comparten hueco; se apilan en
    // vertical porque, con el mismo `y`, React Flow los pintaba uno ENCIMA del
    // otro y solo se veía el de arriba (con las dos etiquetas superpuestas).
    const map = deriveSagaMap(groups([block("B", 1, [work("A", 1), work("B", 1)])]), {}, lookup());
    const [a, b] = map.nodes;
    expect(a.x).toBe(b.x);
    expect(a.orderNo).toBe(b.orderNo);
    expect(a.y).not.toBe(b.y);
  });

  it("un bloque con tándem no invade la fila del bloque siguiente", () => {
    // El apilado del tándem gasta una fila EXTRA: si el bloque siguiente
    // siguiera colocándose en `índice de bloque × paso`, caería justo encima
    // del segundo miembro del tándem.
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1), work("B", 1)]), block("Dos", 2, [work("C", 1)])]),
      {}, lookup(),
    );
    const ys = ["A", "B"].map((id) => map.nodes.find((n) => n.id === `i:book:${id}`)!.y);
    const c = map.nodes.find((n) => n.id === "i:book:C")!;
    expect(c.y).toBeGreaterThan(Math.max(...ys));
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

  // Hallazgo 2 de la revisión final de rama: `derive-map.ts` recorría
  // `Object.entries(windows)` sin mirar el `placement`/`placementInParent`
  // del sujeto. «Solo lo `libre` tiene ventana» es una guarda que ningún
  // CHECK de BD puede imponer entre tablas (mismo motivo que
  // `freeItemWindow`/`freeBlockWindow` en get-saga-detail.ts, que la ficha sí
  // aplica): con una fila rancia de un sujeto que dejó de ser `libre`, la
  // ficha oculta la línea pero el mapa, sin esta guarda, seguiría pintando la
  // arista.
  it("una ventana cuyo sujeto NO es libre (obra fija) no produce arista", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("Z", 1)])]),
      // "Z" es `fijo` (work() lo fija así): una fila rancia de ventana no
      // debería producir arista aunque tenga anclas que sí resuelven.
      { "i:book:Z": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    // Uno y Dos son dos bloques colocados CONSECUTIVOS: sí les toca una
    // arista `principal` de cadena (A→Z) — la ventana rancia es la que no
    // debe producir arista, no la cadena entre bloques.
    expect(map.edges.filter((e) => e.type !== "principal")).toEqual([]);
  });

  it("una ventana cuyo sujeto NO es libre (bloque fijo) no produce arista", () => {
    const map = deriveSagaMap(
      // block() fija placementInParent: "fijo" — un bloque colocado, no libre.
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("Z", 1)])]),
      { "s:saga-Dos": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    // Igual que arriba: Uno→Dos sí tienen cadena, la ventana rancia no.
    expect(map.edges.filter((e) => e.type !== "principal")).toEqual([]);
  });

  it("una entrada libre sin ventana queda suelta, sin aristas que la unan al resto", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), freeBlock("Libre", [work("L", 1)])]),
      {}, lookup(),
    );
    expect(map.edges.some((e) => e.source === "i:book:L" || e.target === "i:book:L")).toBe(false);
  });

  // Hallazgo 1 (CRITICAL) de la revisión: una obra SIN hueco (`position:
  // null`, `libre` o sin clasificar) es un nodo, pero no participa en la
  // cadena — antes se agrupaba como si tuviera un hueco propio y salía
  // encadenada con aristas `principal` a sus vecinas.
  it("un bloque [fijo(A,1), fijo(B,2), libre(Z)] da A→B y nada toca a Z, con Z.orderNo null", () => {
    const map = deriveSagaMap(
      groups([block("Bloque", 1, [work("A", 1), work("B", 2), looseWork("Z")])]),
      {}, lookup(),
    );
    const chainEdges = map.edges.filter((e) => e.type === "principal");
    expect(chainEdges).toEqual([
      expect.objectContaining({ source: "i:book:A", target: "i:book:B" }),
    ]);
    expect(map.edges.some((e) => e.source === "i:book:Z" || e.target === "i:book:Z")).toBe(false);
    expect(map.nodes.find((n) => n.id === "i:book:Z")!.orderNo).toBeNull();
  });

  it("una obra sin clasificar (placement null) tampoco entra en la cadena", () => {
    const map = deriveSagaMap(
      groups([block("Bloque", 1, [work("A", 1), looseWork("Z", null)])]),
      {}, lookup(),
    );
    expect(map.nodes.find((n) => n.id === "i:book:Z")!.orderNo).toBeNull();
    expect(map.edges).toEqual([]);
  });

  it("una obra sin hueco baja a su PROPIA fila, no a la de la cadena de su bloque", () => {
    // Antes se colgaba del mismo `y` que la cadena, detrás del último hueco: en
    // el lienzo parecía un paso más de la secuencia, y su arista de ventana
    // salía como un segmento horizontal ENCIMA de la cadena — solo la
    // distinguía el patrón de guiones. Bajándola de fila, esa arista es
    // diagonal y se distingue sola.
    const map = deriveSagaMap(
      groups([block("Bloque", 1, [work("A", 1), work("B", 2), looseWork("Z")])]),
      {}, lookup(),
    );
    const a = map.nodes.find((n) => n.id === "i:book:A")!;
    const b = map.nodes.find((n) => n.id === "i:book:B")!;
    const z = map.nodes.find((n) => n.id === "i:book:Z")!;
    expect(a.y).toBe(b.y);
    expect(z.y).toBeGreaterThan(a.y);
    // Empieza su propia fila por la izquierda: es una estantería aparte, no la
    // continuación de la cadena.
    expect(z.x).toBe(0);
  });

  it("dos obras sin hueco comparten fila y se reparten en columnas", () => {
    const map = deriveSagaMap(
      groups([block("Bloque", 1, [work("A", 1), looseWork("Y"), looseWork("Z")])]),
      {}, lookup(),
    );
    const y = map.nodes.find((n) => n.id === "i:book:Y")!;
    const z = map.nodes.find((n) => n.id === "i:book:Z")!;
    expect(y.y).toBe(z.y);
    expect(y.x).not.toBe(z.x);
  });

  it("la fila de las sueltas no invade el bloque siguiente", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1), looseWork("Z")]), block("Dos", 2, [work("C", 1)])]),
      {}, lookup(),
    );
    const z = map.nodes.find((n) => n.id === "i:book:Z")!;
    const c = map.nodes.find((n) => n.id === "i:book:C")!;
    expect(c.y).toBeGreaterThan(z.y);
  });

  it("un bloque SIN sueltas no deja una fila vacía detrás", () => {
    // El alto de un bloque depende de lo que tenga: reservar siempre la fila de
    // sueltas dejaría un hueco muerto en la inmensa mayoría de bloques.
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("C", 1)])]),
      {}, lookup(),
    );
    const a = map.nodes.find((n) => n.id === "i:book:A")!;
    const c = map.nodes.find((n) => n.id === "i:book:C")!;
    expect(c.y - a.y).toBe(NODE_STEP_Y);
  });

  it("una obra sin hueco CON ventana sí tiene su arista (a diferencia de la cadena)", () => {
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [looseWork("Z")])]),
      { "i:book:Z": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toContainEqual(
      expect.objectContaining({ source: "i:book:A", target: "i:book:Z", type: "requisito" }),
    );
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

  // Arreglo de la revisión final de rama (punto 1): `createCuratedOrder`
  // ponía los miembros directos PRIMERO, pero `groupMembers` —de donde salen
  // la ficha y el mapa derivado— los pinta AL FINAL, detrás de las hijas. La
  // divergencia era observable en el Cosmere (un único miembro directo,
  // *Arcanum Ilimitado*): el mapa lo pintaba el último y el itinerario
  // generado lo habría abierto el primero. Ninguna prueba ataba los dos
  // órdenes entre sí — esta lo hace: para los MISMOS datos (una saga con un
  // bloque y un miembro directo), el orden de `createCuratedOrder` tiene que
  // coincidir con el orden de los nodos que produce `deriveSagaMap`
  // (traduciendo la clave `tipo:id` de uno a la `i:tipo:id` del otro).
  it("el orden de createCuratedOrder coincide con el de los nodos del mapa, para los mismos datos", () => {
    const directo = work("directo", 1);
    const c1 = work("c1", 1);
    const c2 = work("c2", 2);
    const blockChild: SagaChildRef = {
      id: "saga-Bloque",
      name: "Bloque",
      accentColor: null,
      positionInParent: 1,
      placementInParent: "fijo",
      optionalInParent: false,
    };

    const memberGroups = groupMembers(
      [directo, { ...c1, groupSagaId: "saga-Bloque" }, { ...c2, groupSagaId: "saga-Bloque" }],
      [blockChild],
    );
    const map = deriveSagaMap(memberGroups, {}, lookup());

    const order = createCuratedOrder(
      [
        { id: "R", name: "R", parentSagaId: null, positionInParent: null, placementInParent: null },
        { id: "saga-Bloque", name: "Bloque", parentSagaId: "R", positionInParent: 1, placementInParent: "fijo" },
      ],
      [
        { sagaId: "R", itemType: "book", itemId: "directo", position: 1 },
        { sagaId: "saga-Bloque", itemType: "book", itemId: "c1", position: 1 },
        { sagaId: "saga-Bloque", itemType: "book", itemId: "c2", position: 2 },
      ],
      (key) => key,
    );

    expect(map.nodes.map((n) => n.id)).toEqual(order("R").map((key) => `i:${key}`));
    // Fija el resultado, no solo la igualdad entre los dos: si los dos
    // volvieran a discreparse EN EL MISMO SENTIDO por un cambio futuro, la
    // comparación relativa seguiría en verde y esta prueba no lo notaría.
    expect(order("R")).toEqual(["book:c1", "book:c2", "book:directo"]);
  });

  // Task 3: el itinerario, encima del mapa.
  it("el itinerario numera los nodos por los que pasa y deja el resto a null", () => {
    const map = deriveSagaMap(groups([block("Uno", 1, [work("A", 1), work("B", 2)])]), {}, lookup(), ["i:book:B"]);
    expect(map.nodes.find((n) => n.id === "i:book:B")!.step).toBe(1);
    expect(map.nodes.find((n) => n.id === "i:book:A")!.step).toBeNull();
  });

  it("un paso que el mapa no dibuja se ignora, sin romper la numeración de los demás", () => {
    const map = deriveSagaMap(groups([block("Uno", 1, [work("A", 1)])]), {}, lookup(), ["i:book:fantasma", "i:book:A"]);
    expect(map.nodes.find((n) => n.id === "i:book:A")!.step).toBe(2);
  });

  // Un paso del itinerario puede ser un BLOQUE entero (`s:<uuid>`): el mapa no
  // dibuja bloques (los expande en obras), así que esa clave nunca resuelve a
  // un nodo y se ignora igual que un paso "fantasma" — el itinerario no gana
  // poder sobre el mapa, solo numera lo que ya está dibujado.
  it("un paso que es un bloque se ignora (el mapa no dibuja bloques): no numera la primera obra del bloque ni le contagia el número a la obra siguiente", () => {
    // Bloque con DOS obras y un paso siguiente DISTINTO de la que resolvería
    // `resolveEntry` (ventanas) para "s:saga-Uno": si `deriveSagaMap`
    // resolviera indebidamente el bloque a su primera obra (A), "s:saga-Uno"
    // le pondría step=1 a A, y luego "i:book:B" numeraría B con step=2 — un
    // resultado que, si solo se mirase B, sería indistinguible del correcto.
    // Por eso la prueba tiene que comprobar TAMBIÉN que A se queda sin numerar.
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1), work("B", 2)])]),
      {}, lookup(), ["s:saga-Uno", "i:book:B"],
    );
    expect(map.nodes.find((n) => n.id === "i:book:A")!.step).toBeNull();
    expect(map.nodes.find((n) => n.id === "i:book:B")!.step).toBe(2);
  });

  // Cobertura que faltaba (revisión post Task 3): NODE_STEP_X/NODE_STEP_Y
  // existen para que React Flow no amontone los nodos (coordenadas de índice
  // 0,1,2… los apila), pero ninguna prueba ataba la escala al tamaño real de
  // la tarjeta — todas las aserciones de espaciado eran relacionales
  // (`toBeGreaterThan`, `not.toBe`) y seguían siendo ciertas con
  // NODE_STEP_X = NODE_STEP_Y = 1. Ese fallo ocurrió de verdad en esta rama y
  // ninguna de las 533 pruebas lo detectó, solo se vio midiendo el DOM en el
  // navegador. Las medidas de abajo salen de `graph-nodes.tsx` (`CoverNode`):
  // la tarjeta mide 78×116px y la etiqueta que cuelga debajo mide 150px de
  // ancho, centrada sobre la tarjeta (`mt-2` = 8px de margen, más hasta dos
  // líneas de `text-sm leading-tight`, unos 40px de alto en total).
  it("el paso horizontal separa las columnas lo bastante para que sus etiquetas (150px) no se toquen", () => {
    const LABEL_WIDTH = 150;
    const map = deriveSagaMap(groups([block("Uno", 1, [work("A", 1), work("B", 2)])]), {}, lookup());
    const a = map.nodes.find((n) => n.id === "i:book:A")!;
    const b = map.nodes.find((n) => n.id === "i:book:B")!;
    expect(b.x - a.x).toBeGreaterThanOrEqual(LABEL_WIDTH);
  });

  it("el paso vertical separa las filas lo bastante para que la tarjeta (116px) más su etiqueta (~40px) no invada la fila siguiente", () => {
    const CARD_HEIGHT = 116;
    const LABEL_HEIGHT = 40; // mt-2 (8px) + hasta dos líneas de texto
    const map = deriveSagaMap(
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("B", 1)])]),
      {}, lookup(),
    );
    const a = map.nodes.find((n) => n.id === "i:book:A")!;
    const b = map.nodes.find((n) => n.id === "i:book:B")!;
    expect(b.y - a.y).toBeGreaterThanOrEqual(CARD_HEIGHT + LABEL_HEIGHT);
  });

  // Task 8: la cadena ahora cruza de un bloque colocado al siguiente, en la
  // zona ORDENADA (`partitionGroups`). Antes cada bloque quedaba como una
  // isla — regresión contra el grafo curado a mano que el mapa derivado
  // sustituye.
  describe("la cadena cruza de un bloque colocado al siguiente (zona ordenada)", () => {
    it("dos bloques colocados consecutivos se unen: la última obra del primero con la primera del segundo", () => {
      const map = deriveSagaMap(
        groups([block("Uno", 1, [work("A", 1), work("B", 2)]), block("Dos", 2, [work("C", 1), work("D", 2)])]),
        {}, lookup(),
      );
      const chainEdges = map.edges.filter((e) => e.type === "principal");
      // Orden de inserción real: primero las aristas INTRA de cada bloque (se
      // generan mientras se recorren sus huecos), luego la arista de cadena
      // ENTRE bloques (se añade al terminar de procesar el bloque siguiente).
      expect(chainEdges).toEqual([
        expect.objectContaining({ source: "i:book:A", target: "i:book:B" }),
        expect.objectContaining({ source: "i:book:C", target: "i:book:D" }),
        expect.objectContaining({ source: "i:book:B", target: "i:book:C" }),
      ]);
    });

    it("un bloque libre no se une a la cadena: flota, solo lo conectan sus ventanas", () => {
      const map = deriveSagaMap(
        groups([block("Uno", 1, [work("A", 1)]), freeBlock("Libre", [work("L", 1)])]),
        {}, lookup(),
      );
      expect(map.edges.some((e) => e.type === "principal")).toBe(false);
    });

    it("un bloque sin obras encadenables se salta: el bloque anterior se une con el siguiente, sin romper la cadena", () => {
      const map = deriveSagaMap(
        groups([
          block("Uno", 1, [work("A", 1)]),
          // "Medio" solo tiene una obra suelta (sin hueco): no aporta ningún
          // hueco a la cadena, así que no debe interrumpirla.
          block("Medio", 2, [looseWork("Z")]),
          block("Tres", 3, [work("C", 1)]),
        ]),
        {}, lookup(),
      );
      const chainEdges = map.edges.filter((e) => e.type === "principal");
      expect(chainEdges).toEqual([expect.objectContaining({ source: "i:book:A", target: "i:book:C" })]);
    });

    it("un tándem en el límite conecta todos los pares, igual que dentro de un bloque", () => {
      const map = deriveSagaMap(
        groups([
          block("Uno", 1, [work("A", 1), work("B", 1)]),
          block("Dos", 2, [work("C", 1), work("D", 1)]),
        ]),
        {}, lookup(),
      );
      const chainEdges = map.edges.filter((e) => e.type === "principal");
      const pairs = chainEdges.map((e) => `${e.source}->${e.target}`).sort();
      expect(pairs).toEqual(
        ["i:book:A->i:book:C", "i:book:A->i:book:D", "i:book:B->i:book:C", "i:book:B->i:book:D"].sort(),
      );
    });

    it("los miembros directos (grupo «Nexo») entran en la cadena con la misma regla, sin caso especial", () => {
      // Grupo de miembros directos: sagaId null, placementInParent null —
      // partitionGroups lo mete en `ordered` (solo `libre` va a `free`).
      const directGroup: MemberGroup = {
        sagaId: null,
        name: null,
        accent: "beige",
        members: [work("N", 1)],
        positionInParent: null,
        placementInParent: null,
      };
      const map = deriveSagaMap(groups([block("Uno", 1, [work("A", 1)]), directGroup]), {}, lookup());
      const chainEdges = map.edges.filter((e) => e.type === "principal");
      expect(chainEdges).toEqual([expect.objectContaining({ source: "i:book:A", target: "i:book:N" })]);
    });
  });

  // Task 9: el mapa salía como una escalera diagonal larguísima porque `x` era
  // un contador de columnas COMPARTIDO por todo el mapa (crecía con cada
  // hueco de CUALQUIER bloque). La decisión: una fila por bloque, compacta —
  // `x` se reinicia en cada bloque, así que el ancho del dibujo pasa a ser el
  // del bloque más largo, no la suma de todos. La trampa (y la razón de que
  // esto tenga su propio describe): `orderNo` NO es una coordenada, es el
  // índice lógico que consume `deriveTimeline` para construir su columna del
  // timeline móvil, y TIENE que seguir siendo global y creciente en el orden
  // de lectura — si se le acopla a `x`, el timeline de móvil se rompe sin que
  // ninguna prueba DE ESTE fichero lo note (hay que mirar `orderNo`
  // explícitamente, no solo `x`).
  describe("x se reinicia por bloque; orderNo sigue siendo global y creciente (Task 9)", () => {
    it("dos bloques de igual tamaño: x vuelve a 0 en el segundo bloque, orderNo sigue subiendo", () => {
      const map = deriveSagaMap(
        groups([block("Uno", 1, [work("A", 1), work("B", 2)]), block("Dos", 2, [work("C", 1), work("D", 2)])]),
        {}, lookup(),
      );
      const [a, b, c, d] = ["A", "B", "C", "D"].map((id) => map.nodes.find((n) => n.id === `i:book:${id}`)!);

      // x: cadena horizontal corta que EMPIEZA A LA IZQUIERDA en cada bloque —
      // el segundo bloque repite EXACTAMENTE los mismos x que el primero, en
      // vez de continuar donde lo dejó.
      expect(a.x).toBe(0);
      expect(c.x).toBe(0);
      expect(b.x).toBe(d.x);
      expect(b.x).toBeGreaterThan(a.x);

      // orderNo: contador global, nunca se reinicia — sigue el orden de
      // lectura completo (A, B, C, D), no el de cada bloque por separado.
      expect([a.orderNo, b.orderNo, c.orderNo, d.orderNo]).toEqual([0, 1, 2, 3]);
    });

    it("un bloque largo seguido de uno corto: el ancho del dibujo es el del bloque MÁS LARGO, no la suma de los dos", () => {
      const map = deriveSagaMap(
        groups([
          block("Largo", 1, [work("A", 1), work("B", 2), work("C", 3), work("D", 4), work("E", 5)]),
          block("Corto", 2, [work("F", 1)]),
        ]),
        {}, lookup(),
      );
      const e = map.nodes.find((n) => n.id === "i:book:E")!;
      const f = map.nodes.find((n) => n.id === "i:book:F")!;
      const maxX = Math.max(...map.nodes.map((n) => n.x));
      // Con `x` global (comportamiento viejo) el máximo lo habría marcado F
      // (sexto hueco de todo el mapa, después de los cinco de "Largo").
      // Reiniciado por bloque, F vuelve a x=0 y el máximo del dibujo lo sigue
      // marcando el bloque "Largo" — el ancho es el del bloque más largo, no
      // la suma de todos.
      expect(f.x).toBe(0);
      expect(maxX).toBe(e.x);
    });

    it("tándem en el segundo bloque: comparte x local (0) y hereda el orderNo global correcto", () => {
      const map = deriveSagaMap(
        groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("B", 1), work("C", 1)])]),
        {}, lookup(),
      );
      const a = map.nodes.find((n) => n.id === "i:book:A")!;
      const b = map.nodes.find((n) => n.id === "i:book:B")!;
      const c = map.nodes.find((n) => n.id === "i:book:C")!;
      expect(b.x).toBe(0);
      expect(c.x).toBe(0);
      // El tándem comparte orderNo entre sí, y ambos van DETRÁS de A en el
      // contador global (A=0, B=C=1) — no 0 otra vez por haber reiniciado x.
      expect(b.orderNo).toBe(a.orderNo! + 1);
      expect(c.orderNo).toBe(b.orderNo);
    });

    // Inyección de fallo (parte del contrato de verificación de Task 9): si
    // `orderNo` se acoplara de nuevo a `x` (el error que este cambio invita a
    // cometer), esta prueba es la que tiene que caer — fija el valor exacto
    // de orderNo, no solo que sea "creciente" en abstracto.
    it("fija el valor exacto de orderNo del segundo bloque para atrapar un futuro acoplamiento con x", () => {
      const map = deriveSagaMap(
        groups([
          block("Uno", 1, [work("A", 1), work("B", 2), work("C", 3)]),
          block("Dos", 2, [work("D", 1)]),
        ]),
        {}, lookup(),
      );
      const d = map.nodes.find((n) => n.id === "i:book:D")!;
      // Si orderNo copiara x (que se reinicia por bloque), D.orderNo sería 0.
      // El valor correcto, con orderNo global, es 3 (A=0, B=1, C=2, D=3).
      expect(d.orderNo).toBe(3);
      expect(d.x).toBe(0);
    });
  });
});
