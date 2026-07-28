import { describe, expect, it } from "vitest";
import {
  buildRouteList,
  computeMovedPositions,
  sortCuratedRoutes,
  type CuratedRouteRow,
} from "./get-saga-routes";

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

  it("Task 4-bis: hasGraph=false (interruptor apagado o sin mapa) — «lectura» desaparece pero las curadas y «Publicación» siguen", () => {
    // hasGraph sigue siendo "hay grafo que dibujar" (graph !== null) — pero
    // desde el arreglo tras revisión de Task 4-bis, `graph` mismo ya incorpora
    // el interruptor (`resolveSagaGraph` en get-saga-detail.ts): el curador
    // puede tener nodos curados y aun así `graph === null` si apagó el
    // interruptor. buildRouteList no sabe ni le importa la razón; solo que sin
    // ese booleano no ofrece "lectura". Las curadas y "publicación" no
    // dependen de él en absoluto.
    const list = buildRouteList(
      [{ id: "route-guardia", slug: "guardia", name: "La Guardia", summary: "Policíaco", position: 1, isReadingOrder: false }],
      labels,
      false,
    );
    expect(list.map((r) => r.slug)).toEqual(["guardia", "publicacion"]);
    expect(list.some((r) => r.slug === "lectura")).toBe(false);
  });

  it("las curadas van entre lectura y publicación, por position", () => {
    const list = buildRouteList(
      [
        { id: "route-muerte", slug: "muerte", name: "La Muerte", summary: null, position: 2, isReadingOrder: false },
        { id: "route-guardia", slug: "guardia", name: "La Guardia", summary: "Policíaco", position: 1, isReadingOrder: false },
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
      [{ id: "route-guardia", slug: "guardia", name: "La Guardia", summary: "Policíaco", position: 1, isReadingOrder: false }],
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

  it("con un itinerario designado, «lectura» no se ofrece y el designado ocupa su puesto y su etiqueta", () => {
    const list = buildRouteList(
      [
        { id: "route-muerte", slug: "muerte", name: "La Muerte", summary: null, position: 2, isReadingOrder: false },
        { id: "route-reco", slug: "orden-recomendado", name: "Orden recomendado", summary: "Del autor", position: 1, isReadingOrder: true },
      ],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["orden-recomendado", "muerte", "publicacion"]);
    // La etiqueta la pone el chip; la fila NO se renombra en BD.
    expect(list[0].name).toBe("Orden de lectura");
    expect(list[0].summary).toBe("Del autor");
    expect(list[0].synthetic).toBe(false);
    expect(list[0].id).toBe("route-reco");
    expect(list[0].isReadingOrder).toBe(true);
  });

  it("el designado va PRIMERO aunque su position sea la última", () => {
    const list = buildRouteList(
      [
        { id: "a", slug: "a", name: "Ana", summary: null, position: 1, isReadingOrder: false },
        { id: "b", slug: "b", name: "Beto", summary: null, position: 9, isReadingOrder: true },
      ],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["b", "a", "publicacion"]);
  });

  it("sin designado, todo sigue exactamente como hoy", () => {
    const list = buildRouteList(
      [{ id: "route-guardia", slug: "guardia", name: "La Guardia", summary: null, position: 1, isReadingOrder: false }],
      labels,
      true,
    );
    expect(list.map((r) => r.slug)).toEqual(["lectura", "guardia", "publicacion"]);
    expect(list.every((r) => r.isReadingOrder === false)).toBe(true);
  });

  it("hasGraph=false y designado: «lectura» no vuelve por la puerta de atrás", () => {
    const list = buildRouteList(
      [{ id: "r", slug: "reco", name: "Orden recomendado", summary: null, position: 1, isReadingOrder: true }],
      labels,
      false,
    );
    expect(list.map((r) => r.slug)).toEqual(["reco", "publicacion"]);
    expect(list[0].name).toBe("Orden de lectura");
  });
});

describe("sortCuratedRoutes", () => {
  it("el designado primero, el resto por position y nombre", () => {
    const rows: CuratedRouteRow[] = [
      { id: "c", slug: "c", name: "Ceci", summary: null, position: 3, isReadingOrder: false },
      { id: "a", slug: "a", name: "Ana", summary: null, position: 1, isReadingOrder: false },
      { id: "d", slug: "d", name: "Dani", summary: null, position: 9, isReadingOrder: true },
    ];
    expect(sortCuratedRoutes(rows).map((r) => r.id)).toEqual(["d", "a", "c"]);
  });

  it("no muta la lista que recibe", () => {
    const rows: CuratedRouteRow[] = [
      { id: "a", slug: "a", name: "Ana", summary: null, position: 2, isReadingOrder: false },
      { id: "b", slug: "b", name: "Beto", summary: null, position: 1, isReadingOrder: true },
    ];
    sortCuratedRoutes(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

// Reordenado de rutas (brecha de spec 2026-07-22, Task 8).
describe("computeMovedPositions", () => {
  const guardia: CuratedRouteRow = { id: "guardia", slug: "guardia", name: "La Guardia", summary: null, position: 1, isReadingOrder: false };
  const muerte: CuratedRouteRow = { id: "muerte", slug: "muerte", name: "La Muerte", summary: null, position: 2, isReadingOrder: false };
  const brujas: CuratedRouteRow = { id: "brujas", slug: "brujas", name: "Brujas", summary: null, position: 3, isReadingOrder: false };

  it("mover hacia abajo intercambia con la siguiente y renumera 1..n", () => {
    const next = computeMovedPositions([guardia, muerte, brujas], "guardia", "down");
    expect(next).toEqual([
      { id: "muerte", position: 1 },
      { id: "guardia", position: 2 },
      { id: "brujas", position: 3 },
    ]);
  });

  it("mover hacia arriba intercambia con la anterior", () => {
    const next = computeMovedPositions([guardia, muerte, brujas], "brujas", "up");
    expect(next).toEqual([
      { id: "guardia", position: 1 },
      { id: "brujas", position: 2 },
      { id: "muerte", position: 3 },
    ]);
  });

  it("ya en el extremo: no hay nada que mover, devuelve null", () => {
    expect(computeMovedPositions([guardia, muerte, brujas], "guardia", "up")).toBeNull();
    expect(computeMovedPositions([guardia, muerte, brujas], "brujas", "down")).toBeNull();
  });

  it("routeId inexistente: devuelve null", () => {
    expect(computeMovedPositions([guardia, muerte, brujas], "no-existe", "down")).toBeNull();
  });

  it("posiciones empatadas (position no tiene UNIQUE en BD): se desempata por nombre y el resultado sale sin empates", () => {
    // Dos rutas con la misma position, como podría dejar una carrera entre
    // dos createRoute concurrentes o datos antiguos.
    const a: CuratedRouteRow = { id: "a", slug: "a", name: "Ana", summary: null, position: 1, isReadingOrder: false };
    const b: CuratedRouteRow = { id: "b", slug: "b", name: "Beto", summary: null, position: 1, isReadingOrder: false };
    const c: CuratedRouteRow = { id: "c", slug: "c", name: "Ceci", summary: null, position: 1, isReadingOrder: false };
    // Orden por desempate de nombre: Ana(1), Beto(1), Ceci(1) → mover Ana
    // hacia abajo la intercambia con Beto, y el resultado queda 1..3 sin
    // empates.
    const next = computeMovedPositions([a, b, c], "a", "down");
    expect(next).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
      { id: "c", position: 3 },
    ]);
  });
});
