import { describe, expect, it } from "vitest";
import { buildRouteList } from "./get-saga-routes";

const labels = { lectura: "Orden de lectura", publicacion: "Publicación" };

describe("buildRouteList", () => {
  it("sin rutas curadas devuelve las dos sintéticas, lectura primero", () => {
    const list = buildRouteList([], labels, true);
    expect(list.map((r) => r.slug)).toEqual(["lectura", "publicacion"]);
    expect(list.every((r) => r.synthetic)).toBe(true);
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
        { slug: "muerte", name: "La Muerte", summary: null, position: 2 },
        { slug: "guardia", name: "La Guardia", summary: "Policíaco", position: 1 },
      ],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["lectura", "guardia", "muerte", "publicacion"]);
    expect(list[1].synthetic).toBe(false);
    expect(list[1].summary).toBe("Policíaco");
  });
});
