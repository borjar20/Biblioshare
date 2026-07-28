import { describe, expect, it } from "vitest";
import { createCuratedOrder, itemKey } from "./curated-order";
import type { OrderMembership, OrderSaga } from "./curated-order";
import type { SagaPlacement } from "./types";

// curatedOrder fija la SECUENCIA de una saga (portadas del abanico, bloque
// «siguiente», expansión de un bloque en un itinerario), NO el denominador
// del avance: ese vive en ./progress.ts (countedKeys) desde el 2026-07-25.
// Fase 3 (Task 4, issue #185): hasta esta tarea la SECUENCIA salía de
// main-order.ts y mezclaba grafo (saga_nodes) y curación (position); con
// saga_nodes retirado, la curación es la única fuente.

const root = (id: string, over: Partial<OrderSaga> = {}): OrderSaga => ({
  id,
  name: id,
  parentSagaId: null,
  positionInParent: null,
  placementInParent: null,
  ...over,
});

const child = (id: string, parentSagaId: string, over: Partial<OrderSaga> = {}): OrderSaga => ({
  id,
  name: id,
  parentSagaId,
  positionInParent: null,
  placementInParent: null,
  ...over,
});

const member = (
  sagaId: string,
  itemId: string,
  position: number | null,
  placement: SagaPlacement | null = "fijo",
): OrderMembership => ({
  sagaId,
  itemType: "book",
  itemId,
  position,
  placement,
});

const titleOf = (key: string) => key;
const k = (id: string) => itemKey("book", id);

describe("createCuratedOrder", () => {
  it("ordena los miembros directos por position", () => {
    const order = createCuratedOrder(
      [root("s")],
      [member("s", "b2", 2), member("s", "b1", 1)],
      titleOf,
      {},
    );
    expect(order("s")).toEqual([k("b1"), k("b2")]);
  });

  it("sin position, desempata por título", () => {
    const order = createCuratedOrder(
      [root("s")],
      [member("s", "z", null), member("s", "a", null)],
      titleOf,
      {},
    );
    expect(order("s")).toEqual([k("a"), k("z")]);
  });

  it("las hijas van por su colocación en el padre, no por el hueco mínimo de sus miembros", () => {
    // La heurística vieja (issue #204) daba el orden inverso en este caso.
    const order = createCuratedOrder(
      [root("R"), child("Tarde", "R", { positionInParent: 1 }), child("Pronto", "R", { positionInParent: 2 })],
      [member("Tarde", "z", 9), member("Pronto", "a", 1)],
      titleOf,
      {},
    );
    expect(order("R")).toEqual(["book:z", "book:a"]);
  });

  it("una hija `libre` va detrás de las colocadas", () => {
    const order = createCuratedOrder(
      [root("R"), child("Libre", "R", { placementInParent: "libre" }), child("Fija", "R", { positionInParent: 1 })],
      [member("Libre", "l", 1), member("Fija", "f", 1)],
      titleOf,
      {},
    );
    expect(order("R")).toEqual(["book:f", "book:l"]);
  });

  it("dos hijas sin colocar van por minPos, no por orden alfabético (fallback issue #204)", () => {
    // Ninguna de las dos tiene positionInParent: el fallback debe mirar el
    // hueco MÍNIMO de sus miembros. "Zeta" tiene el hueco más bajo (1) pero
    // es alfabéticamente posterior a "Alfa" (hueco 9) — si el fallback se
    // sustituyera por MAX_SAFE_INTEGER + desempate alfabético (la
    // "simplificación" que un refactor futuro tentaría), este test detecta
    // el cambio: solo pasa si sigue existiendo el fallback a minPos.
    const order = createCuratedOrder(
      [root("R"), child("Zeta", "R"), child("Alfa", "R")],
      [member("Zeta", "z", 1), member("Alfa", "a", 9)],
      titleOf,
      {},
    );
    expect(order("R")).toEqual(["book:z", "book:a"]);
  });

  it("un nodo-saga expande el orden principal de la hija, y los directos del padre van al final", () => {
    // Arreglo de la revisión final de rama (punto 1): los miembros directos
    // ya no van primero — van DETRÁS de las hijas, igual que `groupMembers`
    // (group-members.ts) los pinta en la ficha y en el mapa derivado. Antes
    // de este arreglo esta prueba esperaba [b1, h1, h2]: la divergencia que
    // ninguna prueba ataba entre sí (ver el test de más abajo que sí lo hace).
    const order = createCuratedOrder(
      [root("uni"), child("hija", "uni", { positionInParent: 1 })],
      [member("uni", "b1", 1), member("hija", "h1", 1), member("hija", "h2", 2)],
      titleOf,
      {},
    );
    expect(order("uni")).toEqual([k("h1"), k("h2"), k("b1")]);
  });

  // Hallazgo 3 (revisión Task 6): ninguno de los tests de arriba ejercitaba
  // la deduplicación (el `new Set(...)` de curatedOrder), aunque hace falta
  // — una obra puede ser miembro de dos sagas del mismo subárbol (p. ej. un
  // crossover), y validateRouteDraft rechaza claves repetidas en un
  // itinerario generado. Sin este test, si el `new Set(...)` desapareciera
  // en un refactor, nadie se enteraría hasta que un guardado fallara en
  // producción.
  it("una obra miembro de dos sagas del subárbol no se repite en el orden", () => {
    const order = createCuratedOrder(
      [root("R"), child("A", "R", { positionInParent: 1 }), child("B", "R", { positionInParent: 2 })],
      [member("A", "x", 1), member("B", "x", 1)],
      titleOf,
      {},
    );
    expect(order("R")).toEqual([k("x")]);
  });
});

describe("createCuratedOrder con ventanas", () => {
  // Cosmere reducido: dos bloques colocados y un bloque libre cuya única obra
  // tiene ventana «a partir del bloque 1, antes de la segunda obra del bloque 2».
  const sagas: OrderSaga[] = [
    root("R"),
    child("b1", "R", { name: "Uno", positionInParent: 1, placementInParent: "fijo" }),
    child("b2", "R", { name: "Dos", positionInParent: 2, placementInParent: "fijo" }),
    child("lib", "R", { name: "Libre", positionInParent: null, placementInParent: "libre" }),
  ];
  const memberships: OrderMembership[] = [
    member("b1", "a1", 1),
    member("b2", "c1", 1),
    member("b2", "c2", 2),
    member("lib", "l1", null, "libre"),
  ];

  it("sin ventanas, el orden es exactamente el de siempre", () => {
    const order = createCuratedOrder(sagas, memberships, titleOf, {});
    expect(order("R")).toEqual([k("a1"), k("c1"), k("c2"), k("l1")]);
  });

  it("con ventana, la obra libre retrocede al principio del bloque que partiría", () => {
    const order = createCuratedOrder(sagas, memberships, titleOf, {
      "i:book:l1": { afterKey: "s:b1", beforeKey: "i:book:c2" },
    });
    expect(order("R")).toEqual([k("a1"), k("l1"), k("c1"), k("c2")]);
  });

  it("una ventana sobre algo que ya no es `libre` no mueve nada", () => {
    const fijas = memberships.map((m) => ({ ...m, placement: "fijo" as const }));
    const order = createCuratedOrder(sagas, fijas, titleOf, {
      "i:book:l1": { afterKey: "s:b1", beforeKey: "i:book:c2" },
    });
    expect(order("R")).toEqual([k("a1"), k("c1"), k("c2"), k("l1")]);
  });

  it("un miembro directo de la raíz no es un bloque: no hace de límite", () => {
    // El «Nexo» llega con blockId null, así que insertar delante de él nunca
    // cuenta como partir un bloque.
    const conDirecto: OrderMembership[] = [...memberships, member("R", "nexo", 1)];
    const order = createCuratedOrder(sagas, conDirecto, titleOf, {
      "i:book:l1": { afterKey: "s:b1", beforeKey: "i:book:nexo" },
    });
    expect(order("R")).toEqual([k("a1"), k("c1"), k("c2"), k("l1"), k("nexo")]);
  });
});

describe("invariante: la columna del timeline no contradice al orden curado", () => {
  // Lo único que impide que la #245 se reabra en silencio. Si se filtra el orden
  // curado dejando solo las obras que tienen `orderNo`, tiene que salir
  // exactamente la columna del timeline. No se compara contra el orden de FILAS
  // del mapa: el mapa ordena bloques y el orden curado obras, y divergen a
  // propósito (spec 2026-07-28 §5).
  it("para una saga con un bloque libre con huecos, los dos órdenes coinciden", () => {
    const sagas: OrderSaga[] = [
      root("R"),
      child("b1", "R", { name: "Uno", positionInParent: 1, placementInParent: "fijo" }),
      child("b2", "R", { name: "Dos", positionInParent: 2, placementInParent: "fijo" }),
      child("lib", "R", { name: "Libre", positionInParent: null, placementInParent: "libre" }),
    ];
    const memberships: OrderMembership[] = [
      member("b1", "a1", 1),
      member("b2", "c1", 1),
      member("b2", "c2", 2),
      member("lib", "l1", 1),
    ];
    const curado = createCuratedOrder(sagas, memberships, titleOf, {
      "s:lib": { afterKey: "s:b1", beforeKey: "i:book:c2" },
    });
    // Misma columna que produce deriveSagaMap para esta forma: a1(0) l1(1)
    // c1(2) c2(3), porque orderBlocksForLayout coloca el bloque libre delante
    // del bloque de su ancla `antes de`.
    expect(curado("R")).toEqual([k("a1"), k("l1"), k("c1"), k("c2")]);
  });
});
