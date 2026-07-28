import { nodeBoxOf } from "./graph-metrics";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { TandemMode, WindowReason } from "./types";

// Adornos del grafo 2D (fase 6, frame D): la cápsula que envuelve un tándem y
// el marco que señala el sujeto de una ventana. Se DERIVAN de las coordenadas
// que el grafo ya trae, en vez de añadir campos a `SagaGraph`: ese tipo lo
// comparten tres consumidores (vista 2D, timeline móvil, mini-preview del CTA)
// y esto es dibujo de UNO solo — un nodo sintético de cápsula en `graph.nodes`
// se colaría en `countRoles`, en el `optionalCount` de la pestaña y en
// `deriveTimeline`, que iteran el mismo array.
//
// Puro y sin React a propósito: la geometría se prueba sin montar nada.

/** Margen entre la caja del nodo y el adorno que lo envuelve. */
export const OVERLAY_PAD = 10;

export type TandemCapsule = {
  /** Estable entre renders: el hueco no cambia de identidad aunque cambien sus
   *  obras. */
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: TandemMode | null;
  note: string | null;
  memberIds: string[];
};

export type WindowFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: WindowReason | null;
  /** Título del ancla, ya resuelto a través del nodo. `null` = ese lado está
   *  abierto («a partir de…»), que es un caso real: una de las cinco ventanas
   *  de producción no tiene `antes de`. */
  afterLabel: string | null;
  beforeLabel: string | null;
};

/** Caja que envuelve un conjunto de nodos, con margen. */
function envolver(nodes: SagaGraphNode[]): { x: number; y: number; width: number; height: number } {
  const x0 = Math.min(...nodes.map((n) => n.x));
  const y0 = Math.min(...nodes.map((n) => n.y));
  const x1 = Math.max(...nodes.map((n) => n.x + nodeBoxOf(n).w));
  const y1 = Math.max(...nodes.map((n) => n.y + nodeBoxOf(n).h));
  return {
    x: x0 - OVERLAY_PAD,
    y: y0 - OVERLAY_PAD,
    width: x1 - x0 + OVERLAY_PAD * 2,
    height: y1 - y0 + OVERLAY_PAD * 2,
  };
}

export function deriveMapOverlays(graph: SagaGraph): { tandems: TandemCapsule[]; windows: WindowFrame[] } {
  // Un tándem es el EMPATE DE HUECO, no la fila de metadatos: `node.tandem` es
  // null cuando el curador no declaró nada, y un tándem sin curar sigue siendo
  // un tándem — de hecho es en el que más falta hace explicarlo. `orderNo` es el
  // hueco (deriveSagaMap da uno por hueco, global y creciente), así que el
  // empate de `orderNo` ES la pertenencia. Misma regla que usa `deriveTimeline`
  // para fundir su fila `tandem`: dos reglas distintas para «qué es un tándem»
  // acabarían discrepando (#91/#185/#203).
  const porHueco = new Map<number, SagaGraphNode[]>();
  for (const n of graph.nodes) {
    if (n.kind !== "item" || n.orderNo === null) continue;
    const lista = porHueco.get(n.orderNo);
    if (lista) lista.push(n);
    else porHueco.set(n.orderNo, [n]);
  }

  const tandems: TandemCapsule[] = [];
  for (const [orderNo, miembros] of [...porHueco.entries()].sort((a, b) => a[0] - b[0])) {
    if (miembros.length < 2) continue;
    tandems.push({
      id: `tandem:${orderNo}`,
      ...envolver(miembros),
      // Denormalizados en los N nodos del hueco por deriveSagaMap: basta con el
      // primero, igual que hace la fila del timeline.
      mode: miembros[0].tandem?.mode ?? null,
      note: miembros[0].tandem?.note ?? null,
      memberIds: miembros.map((n) => n.id),
    });
  }

  // Quién es SUJETO de una ventana, sin volver a mirar la tabla ni re-resolver
  // ninguna clave: `deriveSagaMap` ya dibujó las dos aristas, y su dirección lo
  // dice sin ambigüedad — la arista `requisito` va ancla-después → sujeto, y la
  // `opcional` va sujeto → ancla-antes. Son los dos ÚNICOS usos de esos dos
  // tipos de arista en todo el mapa (el resto es `principal` e `itinerario`).
  // Re-resolver las anclas por nuestra cuenta es cómo dos vistas acaban
  // discrepando de la misma fila (#91/#185/#203).
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const anclaDespues = new Map<string, string>(); // sujeto -> id del ancla
  const anclaAntes = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type === "requisito") anclaDespues.set(e.target, e.source);
    else if (e.type === "opcional") anclaAntes.set(e.source, e.target);
  }

  const windows: WindowFrame[] = [];
  for (const sujetoId of new Set([...anclaDespues.keys(), ...anclaAntes.keys()])) {
    const sujeto = byId.get(sujetoId);
    if (!sujeto || sujeto.kind !== "item") continue;
    // Solo una obra LIBRE lleva marco. Un sujeto-BLOQUE lo resuelve
    // `deriveSagaMap` a la primera obra del bloque, que es una fila normal de la
    // cadena: marcarla diría que esa obra tiene ventana propia, y es falso. Es
    // el mismo límite con el que `deriveSagaMap` se niega a colgarle el
    // `windowReason` (issue #221), y tiene que seguir siendo el mismo o la vista
    // y el motor discreparían sobre qué es una ventana.
    if (sujeto.orderNo !== null) continue;

    const after = anclaDespues.get(sujetoId);
    const before = anclaAntes.get(sujetoId);
    windows.push({
      id: `window:${sujetoId}`,
      ...envolver([sujeto]),
      reason: sujeto.windowReason,
      afterLabel: (after && byId.get(after)?.label) ?? null,
      beforeLabel: (before && byId.get(before)?.label) ?? null,
    });
  }
  // Orden estable: `Set` conserva el orden de inserción, que depende del orden
  // de las aristas. Ordenar por id lo hace independiente de eso.
  windows.sort((a, b) => a.id.localeCompare(b.id));

  return { tandems, windows };
}
