import { describe, expect, it } from "vitest";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import { windowTrack } from "./window-track";

// Columna de 4 obras: los cortes caen en 25 / 50 / 75 / 100 %.
const n = (id: string, orderNo: number | null, status: SagaGraphNode["status"] = null): SagaGraphNode => ({
  id, kind: "item", x: 0, y: 0, level: "principal", orderNo, label: id, accent: "beige",
  status, role: null, coverUrl: null, covers: [], href: `/${id}`, memberCount: null,
  groupSagaId: "g", groupName: "G", step: null, tandem: null, windowReason: null,
});
const g = (nodes: SagaGraphNode[]): SagaGraph => ({ nodes, edges: [] });
/** Columna de 4, con las obras nombradas ya completadas. */
const cuatro = (...done: string[]) =>
  g(["o1", "o2", "o3", "o4"].map((id, i) => n(id, i, done.includes(id) ? "completed" : null)));

describe("windowTrack · el tramo", () => {
  it("sitúa el tramo entre sus dos anclas", () => {
    const t = windowTrack(cuatro(), { after: n("o1", 0), before: n("o3", 2) }, { authenticated: true })!;
    expect([t.fromPct, t.toPct]).toEqual([25, 75]);
  });

  it("sin ancla «después de», el tramo empieza abierto", () => {
    const t = windowTrack(cuatro(), { after: null, before: n("o2", 1) }, { authenticated: true })!;
    expect([t.fromPct, t.toPct]).toEqual([0, 50]);
  });

  it("sin ancla «antes de», el tramo acaba abierto", () => {
    const t = windowTrack(cuatro(), { after: n("o2", 1), before: null }, { authenticated: true })!;
    expect([t.fromPct, t.toPct]).toEqual([50, 100]);
  });

  it("un ancla que no está en la columna abre ese extremo", () => {
    // Un ancla puede resolver a una obra `libre`, que no tiene hueco y por
    // tanto no tiene sitio en la barra. Se pinta abierta en vez de inventarle
    // una posición.
    const t = windowTrack(cuatro(), { after: n("suelta", null), before: n("o3", 2) }, { authenticated: true })!;
    expect(t.fromPct).toBe(0);
  });

  it("una ventana al revés no pinta track", () => {
    // «después de o3» y «antes de o1»: una banda de anchura negativa es peor
    // que ninguna, y la fila sigue nombrando las dos anclas, que es lo que
    // permite verlo y corregirlo.
    expect(windowTrack(cuatro(), { after: n("o3", 2), before: n("o1", 0) }, { authenticated: true })).toBeNull();
  });

  it("sin columna no hay barra sobre la que situar nada", () => {
    expect(windowTrack(g([]), { after: null, before: null }, { authenticated: true })).toBeNull();
  });
});

describe("windowTrack · dónde estás", () => {
  it("aún no: lo completado se queda antes del tramo", () => {
    const t = windowTrack(cuatro("o1"), { after: n("o3", 2), before: n("o4", 3) }, { authenticated: true })!;
    expect(t.youPct).toBe(25);
    expect(t.notice).toBe("antes");
  });

  it("dentro: lo completado cae en el tramo", () => {
    const t = windowTrack(cuatro("o1", "o2"), { after: n("o1", 0), before: n("o3", 2) }, { authenticated: true })!;
    expect(t.notice).toBe("dentro");
  });

  it("pasada: lo completado va más allá del tramo", () => {
    const t = windowTrack(cuatro("o1", "o2", "o3", "o4"), { after: n("o1", 0), before: n("o2", 1) }, { authenticated: true })!;
    expect(t.notice).toBe("pasada");
  });

  it("manda lo más avanzado, no lo último de la lista", () => {
    // Solo `o4` completada: el lector está al final aunque se haya saltado
    // las tres primeras.
    const t = windowTrack(cuatro("o4"), { after: n("o1", 0), before: n("o2", 1) }, { authenticated: true })!;
    expect(t.youPct).toBe(100);
    expect(t.notice).toBe("pasada");
  });

  it("`in_progress` no cuenta como completado", () => {
    // El predicado único (`completion.ts`) dice `completed` y solo eso.
    const graph = g([n("o1", 0, "in_progress"), n("o2", 1), n("o3", 2), n("o4", 3)]);
    const t = windowTrack(graph, { after: n("o2", 1), before: n("o3", 2) }, { authenticated: true })!;
    expect(t.youPct).toBe(0);
  });

  it("sin nada completado, el lector está en la salida", () => {
    const t = windowTrack(cuatro(), { after: n("o2", 1), before: n("o3", 2) }, { authenticated: true })!;
    expect(t.youPct).toBe(0);
    expect(t.notice).toBe("antes");
  });

  it("sin nada completado y con el tramo abierto por delante, estás dentro", () => {
    const t = windowTrack(cuatro(), { after: null, before: n("o3", 2) }, { authenticated: true })!;
    expect(t.notice).toBe("dentro");
  });

  it("SIN SESIÓN pinta el tramo pero ni marcador ni aviso", () => {
    // La ficha es pública: esta es la vista por defecto de cualquiera que
    // llegue de fuera, no una variante secundaria.
    const t = windowTrack(cuatro(), { after: n("o1", 0), before: n("o3", 2) }, { authenticated: false })!;
    expect([t.fromPct, t.toPct]).toEqual([25, 75]);
    expect(t.youPct).toBeNull();
    expect(t.notice).toBeNull();
  });

  it("SIN SESIÓN da igual lo que digan los estados de los nodos", () => {
    // Sin usuario, `get-saga-detail` ni consulta los pases y todos llegan a
    // null; pero si algún día llegaran rellenos, el flag manda igual.
    const t = windowTrack(cuatro("o1", "o2", "o3"), { after: n("o1", 0), before: n("o2", 1) }, { authenticated: false })!;
    expect(t.youPct).toBeNull();
    expect(t.notice).toBeNull();
  });
});
