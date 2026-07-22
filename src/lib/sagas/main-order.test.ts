import { describe, expect, it } from "vitest";
import { createMainOrder, itemKey } from "./main-order";
import type { OrderMembership, OrderNode, OrderSaga } from "./main-order";

// La regla del orden principal (spec §1.5) es la ÚNICA definición del
// denominador del avance; el issue #91 nació de duplicarla. Estos tests fijan
// su comportamiento para que el próximo consumidor (los itinerarios) la
// reutilice en vez de reimplementarla.

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

  it("con grafo, solo entran los nodos con order_no: los opcionales no penalizan", () => {
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
  // fuera"), así que el usuario no puede verlo ni marcarlo. Si además cuenta
  // en el denominador, ese avance NUNCA puede llegar al 100%.
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
