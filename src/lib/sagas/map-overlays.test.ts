import { describe, expect, it } from "vitest";
import { deriveMapOverlays } from "./map-overlays";
import type { SagaGraph, SagaGraphNode } from "./map-types";

const node = (id: string, x: number, y: number, extra: Partial<SagaGraphNode> = {}): SagaGraphNode => ({
  id,
  kind: "item",
  x,
  y,
  level: "principal",
  orderNo: 0,
  label: id,
  accent: "beige",
  status: null,
  role: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: null,
  groupName: null,
  step: null,
  tandem: null,
  windowReason: null,
  optional: false,
  skipped: false,
  ownerSagaId: "owner",
  ...extra,
});

const graph = (nodes: SagaGraphNode[], edges: SagaGraph["edges"] = []): SagaGraph => ({ nodes, edges });

describe("deriveMapOverlays · cápsulas de tándem", () => {
  it("envuelve las dos obras que comparten hueco, y solo esas", () => {
    const g = graph([
      node("a", 0, 0, { orderNo: 0 }),
      node("b", 180, 0, { orderNo: 1, tandem: { mode: "simultaneo", note: null } }),
      node("c", 180, 220, { orderNo: 1, tandem: { mode: "simultaneo", note: null } }),
      node("d", 360, 0, { orderNo: 2 }),
    ]);
    const { tandems } = deriveMapOverlays(g);
    expect(tandems).toHaveLength(1);
    expect(tandems[0].memberIds).toEqual(["b", "c"]);
    expect(tandems[0].mode).toBe("simultaneo");
  });

  it("la cápsula envuelve las cajas de sus miembros con margen", () => {
    const g = graph([node("b", 180, 0, { orderNo: 1 }), node("c", 180, 220, { orderNo: 1 })]);
    const [cap] = deriveMapOverlays(g).tandems;
    // portada 78×116: de (180,0) a (258,336), más 10 px de margen por lado.
    expect(cap.x).toBe(170);
    expect(cap.y).toBe(-10);
    expect(cap.width).toBe(98);
    expect(cap.height).toBe(356);
  });

  it("un hueco compartido SIN metadatos curados también lleva cápsula", () => {
    const g = graph([node("b", 0, 0, { orderNo: 1 }), node("c", 0, 220, { orderNo: 1 })]);
    const [cap] = deriveMapOverlays(g).tandems;
    expect(cap.mode).toBeNull();
    expect(cap.note).toBeNull();
  });

  it("la nota del hueco llega a la cápsula", () => {
    const g = graph([
      node("b", 0, 0, { orderNo: 1, tandem: { mode: "indistinto", note: "En cualquier orden" } }),
      node("c", 0, 220, { orderNo: 1, tandem: { mode: "indistinto", note: "En cualquier orden" } }),
    ]);
    const [cap] = deriveMapOverlays(g).tandems;
    expect(cap.mode).toBe("indistinto");
    expect(cap.note).toBe("En cualquier orden");
  });

  it("no hay cápsula sin empate: dos obras sueltas no son un tándem", () => {
    const g = graph([node("x", 0, 0, { orderNo: null }), node("y", 0, 220, { orderNo: null })]);
    expect(deriveMapOverlays(g).tandems).toEqual([]);
  });

  it("un nodo de tamaño distinto no descuadra la cápsula", () => {
    const g = graph([
      node("b", 0, 0, { orderNo: 1 }),
      node("c", 0, 220, { orderNo: 1, level: "menor", optional: true }),
    ]);
    const [cap] = deriveMapOverlays(g).tandems;
    // el medallón mide 58: el ancho lo manda la portada (78), el alto llega a 220+58.
    expect(cap.width).toBe(98);
    expect(cap.height).toBe(298);
  });

  it("un tándem de tres miembros sigue siendo una sola cápsula", () => {
    const g = graph([
      node("b", 0, 0, { orderNo: 1 }),
      node("c", 0, 220, { orderNo: 1 }),
      node("d", 0, 440, { orderNo: 1 }),
    ]);
    const { tandems } = deriveMapOverlays(g);
    expect(tandems).toHaveLength(1);
    expect(tandems[0].memberIds).toHaveLength(3);
    expect(tandems[0].height).toBe(576);
  });
});

describe("deriveMapOverlays · marcos de ventana", () => {
  // La forma real de la ventana de Trono de Cristal, la única de producción con
  // sus dos anclas resueltas a obras.
  const conVentana = () =>
    graph(
      [
        node("ancla-a", 0, 0, { orderNo: 0, label: "Corona de Medianoche" }),
        node("ancla-b", 180, 0, { orderNo: 1, label: "Heredera de Fuego" }),
        node("sujeto", 0, 440, { orderNo: null, label: "La Espada de la Asesina", windowReason: "contexto" }),
      ],
      [
        { id: "w1", source: "ancla-a", target: "sujeto", type: "requisito", accent: "beige" },
        { id: "w2", source: "sujeto", target: "ancla-b", type: "opcional", accent: "ambar" },
      ],
    );

  it("marca al SUJETO, no a la región entre las anclas", () => {
    const { windows } = deriveMapOverlays(conVentana());
    expect(windows).toHaveLength(1);
    // Envuelve solo el sujeto: (0,440) + 78×116, con 10 px de margen. La caja
    // envolvente de los tres extremos mediría 438×556 — el 45 % del lienzo de
    // ese mapa, con una obra ajena dentro [MEDIDO 2026-07-28].
    expect(windows[0]).toMatchObject({ x: -10, y: 430, width: 98, height: 136 });
  });

  it("lee los dos títulos de las anclas y el motivo", () => {
    const [w] = deriveMapOverlays(conVentana()).windows;
    expect(w.afterLabel).toBe("Corona de Medianoche");
    expect(w.beforeLabel).toBe("Heredera de Fuego");
    expect(w.reason).toBe("contexto");
  });

  it("un lado abierto llega como null, no como cadena vacía", () => {
    const g = graph(
      [
        node("ancla-a", 0, 0, { orderNo: 0, label: "Juramentada" }),
        node("sujeto", 0, 220, { orderNo: null, label: "Esquirla del Amanecer", level: "menor", optional: true }),
      ],
      [{ id: "w1", source: "ancla-a", target: "sujeto", type: "requisito", accent: "beige" }],
    );
    const [w] = deriveMapOverlays(g).windows;
    expect(w.afterLabel).toBe("Juramentada");
    expect(w.beforeLabel).toBeNull();
    expect(w.reason).toBeNull();
    // El medallón mide 58, no 78: la caja lo sigue.
    expect(w.width).toBe(78);
  });

  it("un sujeto que es un BLOQUE resuelto a su primera obra NO lleva marco (#221)", () => {
    // deriveSagaMap resuelve `s:<uuid>` a la primera obra del bloque, que es una
    // fila normal de la cadena (orderNo !== null): pintarle marco diría que esa
    // obra tiene ventana propia, que es falso. Pasa de verdad en producción, con
    // la ventana de Nacidos de la Bruma. Era 2 bajo Cosmere.
    const g = graph(
      [node("ancla-a", 0, 0, { orderNo: 0 }), node("primera-del-bloque", 0, 220, { orderNo: 5 })],
      [{ id: "w1", source: "ancla-a", target: "primera-del-bloque", type: "requisito", accent: "beige" }],
    );
    expect(deriveMapOverlays(g).windows).toEqual([]);
  });

  it("no confunde el ancla «antes de» con un sujeto", () => {
    const { windows } = deriveMapOverlays(conVentana());
    expect(windows.map((w) => w.id)).toEqual(["window:sujeto"]);
  });

  it("las aristas de cadena y las del itinerario no producen marcos", () => {
    const g = graph(
      [node("a", 0, 0, { orderNo: 0 }), node("b", 180, 0, { orderNo: null })],
      [
        { id: "c1", source: "a", target: "b", type: "principal", accent: "beige" },
        { id: "r1", source: "b", target: "a", type: "itinerario", accent: "beige" },
      ],
    );
    expect(deriveMapOverlays(g).windows).toEqual([]);
  });
});
