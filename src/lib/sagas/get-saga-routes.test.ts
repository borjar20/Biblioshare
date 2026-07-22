import { describe, expect, it } from "vitest";
import { buildRouteList } from "./get-saga-routes";

const labels = { lectura: "Orden de lectura", publicacion: "Publicación" };

describe("buildRouteList", () => {
  it("sin rutas curadas devuelve las dos sintéticas, lectura primero", () => {
    const list = buildRouteList([], labels, true);
    expect(list.map((r) => r.slug)).toEqual(["lectura", "publicacion"]);
    expect(list.every((r) => r.synthetic)).toBe(true);
    // Las sintéticas no tienen fila en saga_routes: sin id (hallazgo 3).
    expect(list.every((r) => r.id === undefined)).toBe(true);
  });

  it("sin grafo, «lectura» no se ofrece", () => {
    // Sin saga_nodes no hay orden curado que enseñar: la ficha de hoy ni
    // siquiera pinta la pestaña Mapa.
    const list = buildRouteList([], labels, false);
    expect(list.map((r) => r.slug)).toEqual(["publicacion"]);
  });

  it("las curadas van entre lectura y publicación, por position", () => {
    const list = buildRouteList(
      [
        { id: "route-muerte", slug: "muerte", name: "La Muerte", summary: null, position: 2 },
        { id: "route-guardia", slug: "guardia", name: "La Guardia", summary: "Policíaco", position: 1 },
      ],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["lectura", "guardia", "muerte", "publicacion"]);
    expect(list[1].synthetic).toBe(false);
    expect(list[1].summary).toBe("Policíaco");
  });

  // Hallazgo 3: el id de la fila curada tiene que viajar hasta SagaRoute para
  // que RouteView pueda localizar la ruta activa en detail.routes sin volver
  // a consultar saga_routes solo para conseguirlo.
  it("el id de una curada viaja hasta SagaRoute; las sintéticas no tienen id", () => {
    const list = buildRouteList(
      [{ id: "route-guardia", slug: "guardia", name: "La Guardia", summary: "Policíaco", position: 1 }],
      labels,
      true,
    );
    const curated = list.find((r) => r.slug === "guardia");
    expect(curated?.id).toBe("route-guardia");
    const lectura = list.find((r) => r.slug === "lectura");
    const publicacion = list.find((r) => r.slug === "publicacion");
    expect(lectura?.id).toBeUndefined();
    expect(publicacion?.id).toBeUndefined();
  });
});
