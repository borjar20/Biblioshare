import { describe, expect, it } from "vitest";
import { countRouteEntries } from "./count-route-entries";

describe("countRouteEntries", () => {
  it("sin filas devuelve un mapa vacío", () => {
    expect(countRouteEntries([])).toEqual({});
  });

  it("cuenta pasos y notas de una ruta", () => {
    expect(
      countRouteEntries([
        { route_id: "r1", note: "empieza aquí" },
        { route_id: "r1", note: null },
        { route_id: "r1", note: "no lo leas antes" },
      ]),
    ).toEqual({ r1: { steps: 3, notes: 2 } });
  });

  // La BD acepta '' aunque el editor guarde null en ese caso. Un contador que
  // dijera «3 notas» con tres cadenas vacías mentiría al curador.
  it("no cuenta como nota la cadena vacía ni la de solo espacios", () => {
    expect(
      countRouteEntries([
        { route_id: "r1", note: "" },
        { route_id: "r1", note: "   " },
        { route_id: "r1", note: "\n\t" },
        { route_id: "r1", note: "esta sí" },
      ]),
    ).toEqual({ r1: { steps: 4, notes: 1 } });
  });

  it("separa las rutas aunque sus filas vengan entremezcladas", () => {
    expect(
      countRouteEntries([
        { route_id: "r1", note: "a" },
        { route_id: "r2", note: null },
        { route_id: "r1", note: null },
        { route_id: "r2", note: "b" },
        { route_id: "r2", note: "c" },
      ]),
    ).toEqual({ r1: { steps: 2, notes: 1 }, r2: { steps: 3, notes: 2 } });
  });

  // Una ruta SIN pasos no aparece en el mapa: el llamador la resuelve con
  // `?? { steps: 0, notes: 0 }`. Inventar aquí una entrada a cero exigiría
  // conocer la lista de rutas, que esta función no recibe.
  it("una ruta sin filas queda ausente del mapa, no a cero", () => {
    const result = countRouteEntries([{ route_id: "r1", note: null }]);
    expect(result.r2).toBeUndefined();
    expect(Object.keys(result)).toEqual(["r1"]);
  });
});
