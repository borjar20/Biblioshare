import { describe, expect, it } from "vitest";
import { countedKeys, type ProgressMembership, type ProgressSaga } from "./progress";

const saga = (id: string, parentSagaId: string | null = null, optionalInParent = false): ProgressSaga => ({
  id,
  parentSagaId,
  optionalInParent,
});
const member = (sagaId: string, itemId: string, optional = false): ProgressMembership => ({
  sagaId,
  itemType: "book",
  itemId,
  optional,
});

describe("countedKeys", () => {
  it("cuenta los miembros del subárbol y deja fuera los marcados optional", () => {
    const sagas = [saga("root")];
    const members = [member("root", "a"), member("root", "b", true), member("root", "c")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a", "book:c"]);
  });

  it("un bloque optional saca a su subárbol del denominador del padre", () => {
    const sagas = [saga("root"), saga("hija", "root", true)];
    const members = [member("root", "a"), member("hija", "x"), member("hija", "y")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a"]);
  });

  it("pero ese mismo bloque, como raíz, sí cuenta los suyos", () => {
    const sagas = [saga("root"), saga("hija", "root", true)];
    const members = [member("root", "a"), member("hija", "x"), member("hija", "y")];
    expect(countedKeys("hija", sagas, members)).toEqual(["book:x", "book:y"]);
  });

  it("no depende del orden: sin position, con position repetida (tándem), da igual", () => {
    // El denominador cuenta OBRAS, no huecos: un tándem son dos obras que leer.
    const sagas = [saga("root")];
    const members = [member("root", "a"), member("root", "b")];
    expect(countedKeys("root", sagas, members)).toHaveLength(2);
  });

  it("deduplica la multi-membresía: la misma obra en dos sagas del árbol cuenta una vez", () => {
    const sagas = [saga("root"), saga("hija", "root")];
    const members = [member("root", "a"), member("hija", "a"), member("hija", "b")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a", "book:b"]);
  });

  it("lo sin clasificar cuenta: optional=false es el default", () => {
    const sagas = [saga("root")];
    const members = [member("root", "a")];
    expect(countedKeys("root", sagas, members)).toEqual(["book:a"]);
  });

  it("un ciclo saga→saga no cuelga ni duplica", () => {
    const a = { ...saga("a"), parentSagaId: "b" };
    const b = { ...saga("b"), parentSagaId: "a" };
    const members = [member("a", "x"), member("b", "y")];
    expect(countedKeys("a", [a, b], members).sort()).toEqual(["book:x", "book:y"]);
  });

  it("el caso Mundodisco: sin grafo y sin ningún position, cuenta las 26", () => {
    // La regresión que motiva la fase: hoy esta saga da 0/0 porque el
    // denominador salía del grafo y ningún nodo tenía order_no.
    const sagas = [
      saga("mundodisco"),
      saga("guardias", "mundodisco"),
      saga("muerte", "mundodisco"),
    ];
    const members = [
      ...Array.from({ length: 8 }, (_, i) => member("guardias", `g${i}`)),
      ...Array.from({ length: 18 }, (_, i) => member("muerte", `m${i}`)),
    ];
    expect(countedKeys("mundodisco", sagas, members)).toHaveLength(26);
  });
});
