import { describe, expect, it } from "vitest";
import { createCuratedOrder, itemKey } from "./curated-order";
import type { OrderMembership, OrderSaga } from "./curated-order";

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

const member = (sagaId: string, itemId: string, position: number | null): OrderMembership => ({
  sagaId,
  itemType: "book",
  itemId,
  position,
});

const titleOf = (key: string) => key;
const k = (id: string) => itemKey("book", id);

describe("createCuratedOrder", () => {
  it("ordena los miembros directos por position", () => {
    const order = createCuratedOrder(
      [root("s")],
      [member("s", "b2", 2), member("s", "b1", 1)],
      titleOf,
    );
    expect(order("s")).toEqual([k("b1"), k("b2")]);
  });

  it("sin position, desempata por título", () => {
    const order = createCuratedOrder(
      [root("s")],
      [member("s", "z", null), member("s", "a", null)],
      titleOf,
    );
    expect(order("s")).toEqual([k("a"), k("z")]);
  });

  it("las hijas van por su colocación en el padre, no por el hueco mínimo de sus miembros", () => {
    // La heurística vieja (issue #204) daba el orden inverso en este caso.
    const order = createCuratedOrder(
      [root("R"), child("Tarde", "R", { positionInParent: 1 }), child("Pronto", "R", { positionInParent: 2 })],
      [member("Tarde", "z", 9), member("Pronto", "a", 1)],
      titleOf,
    );
    expect(order("R")).toEqual(["book:z", "book:a"]);
  });

  it("una hija `libre` va detrás de las colocadas", () => {
    const order = createCuratedOrder(
      [root("R"), child("Libre", "R", { placementInParent: "libre" }), child("Fija", "R", { positionInParent: 1 })],
      [member("Libre", "l", 1), member("Fija", "f", 1)],
      titleOf,
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
    );
    expect(order("R")).toEqual(["book:z", "book:a"]);
  });

  it("un nodo-saga expande el orden principal de la hija", () => {
    const order = createCuratedOrder(
      [root("uni"), child("hija", "uni", { positionInParent: 1 })],
      [member("uni", "b1", 1), member("hija", "h1", 1), member("hija", "h2", 2)],
      titleOf,
    );
    expect(order("uni")).toEqual([k("b1"), k("h1"), k("h2")]);
  });
});
