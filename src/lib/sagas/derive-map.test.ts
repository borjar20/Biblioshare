import { describe, expect, it } from "vitest";
import { createCuratedOrder } from "./curated-order";
import { deriveSagaMap, type MapLookup } from "./derive-map";
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
    expect(map.edges).toEqual([]);
  });

  it("una ventana cuyo sujeto NO es libre (bloque fijo) no produce arista", () => {
    const map = deriveSagaMap(
      // block() fija placementInParent: "fijo" — un bloque colocado, no libre.
      groups([block("Uno", 1, [work("A", 1)]), block("Dos", 2, [work("Z", 1)])]),
      { "s:saga-Dos": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null } },
      lookup(),
    );
    expect(map.edges).toEqual([]);
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

  it("una obra sin hueco conserva la fila de su bloque y su x va tras el último hueco", () => {
    const map = deriveSagaMap(
      groups([block("Bloque", 1, [work("A", 1), work("B", 2), looseWork("Z")])]),
      {}, lookup(),
    );
    const a = map.nodes.find((n) => n.id === "i:book:A")!;
    const b = map.nodes.find((n) => n.id === "i:book:B")!;
    const z = map.nodes.find((n) => n.id === "i:book:Z")!;
    expect(z.y).toBe(a.y);
    expect(z.y).toBe(b.y);
    expect(z.x).toBeGreaterThan(b.x);
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
});
