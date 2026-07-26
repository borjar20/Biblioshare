import { describe, expect, it } from "vitest";
import { createMainOrder, itemKey } from "./main-order";
import type { OrderMembership, OrderNode, OrderSaga } from "./main-order";

// mainOrder fija la SECUENCIA de una saga (portadas del abanico, bloque
// «siguiente»), NO el denominador del avance: ese vive en ./progress.ts
// (countedKeys) desde el 2026-07-25. Hasta esa fecha sí lo era — el issue #91
// nació de duplicar esa regla en dos sitios — pero desde el cambio, mezclar
// ambas lecturas es justo el tipo de bug que ha dado tres fallos seguidos
// (review de Task 5, 2ª ronda). Estos tests fijan el comportamiento de
// SECUENCIA para que itinerarios y demás consumidores lo reutilicen en vez de
// reimplementarlo.

const saga = (id: string, parentSagaId: string | null = null): OrderSaga => ({
  id,
  name: id,
  parentSagaId,
});

const member = (sagaId: string, itemId: string, position: number | null): OrderMembership => ({
  sagaId,
  itemType: "book",
  itemId,
  position,
});

const itemNode = (sagaId: string, itemId: string, orderNo: number | null): OrderNode => ({
  sagaId,
  itemType: "book",
  itemId,
  childSagaId: null,
  orderNo,
});

const sagaNode = (sagaId: string, childSagaId: string, orderNo: number | null): OrderNode => ({
  sagaId,
  itemType: null,
  itemId: null,
  childSagaId,
  orderNo,
});

const titles = (key: string) => key;
const k = (id: string) => itemKey("book", id);

describe("createMainOrder", () => {
  it("sin grafo, ordena los miembros directos por position", () => {
    const order = createMainOrder(
      [saga("s")],
      [member("s", "b2", 2), member("s", "b1", 1)],
      [],
      titles,
    );
    expect(order("s")).toEqual([k("b1"), k("b2")]);
  });

  it("con grafo, solo entran los nodos con order_no: el resto queda fuera de la SECUENCIA, no del denominador", () => {
    const order = createMainOrder(
      [saga("s")],
      [member("s", "b1", 1), member("s", "extra", null)],
      [itemNode("s", "b1", 1), itemNode("s", "extra", null)],
      titles,
    );
    expect(order("s")).toEqual([k("b1")]);
  });

  it("un nodo-saga expande el orden principal de la hija", () => {
    const order = createMainOrder(
      [saga("uni"), saga("hija", "uni")],
      [member("uni", "b1", 1), member("hija", "h1", 1), member("hija", "h2", 2)],
      [itemNode("uni", "b1", 1), sagaNode("uni", "hija", 2)],
      titles,
    );
    expect(order("uni")).toEqual([k("b1"), k("h1"), k("h2")]);
  });

  // Issue #170. Un nodo del grafo puede apuntar a un ítem que no es miembro:
  // saga_nodes.item_id no tiene FK y save_saga_graph no valida la membresía.
  // buildSagaGraph lo descarta al pintar (graph-data.ts, "nodo huérfano
  // fuera"), así que el usuario no puede verlo ni marcarlo. mainOrder lo
  // descarta de la SECUENCIA por la misma razón (no tiene sentido proponerlo
  // como «siguiente» ni pintarlo en el abanico) — no por proteger un
  // denominador: ese vive en countedKeys (./progress.ts), que ni siquiera
  // mira el grafo, así que el #170 no puede reaparecer ahí.
  it("descarta el nodo huérfano, igual que hace buildSagaGraph al pintar", () => {
    const order = createMainOrder(
      [saga("s")],
      [member("s", "b1", 1), member("s", "b2", 2)],
      [itemNode("s", "b1", 1), itemNode("s", "fantasma", 2), itemNode("s", "b2", 3)],
      titles,
    );
    expect(order("s")).toEqual([k("b1"), k("b2")]);
  });

  it("cuenta al miembro cuya membresía vive en otra saga del árbol", () => {
    // El editor puede dejar la membresía en una descendiente mientras el nodo
    // cuelga de la raíz; membersByKey (el lookup de buildSagaGraph) se
    // construye con TODO el subárbol, así que aquí el criterio es el mismo.
    const order = createMainOrder(
      [saga("uni"), saga("hija", "uni")],
      [member("hija", "b1", 1)],
      [itemNode("uni", "b1", 1)],
      titles,
    );
    expect(order("uni")).toEqual([k("b1")]);
  });
});
