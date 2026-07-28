import { NODE_STEP_X } from "./graph-metrics";
import type { SagaGraph, SagaGraphNode } from "./map-types";

// Post-pase de layout del mapa 2D: alinea las columnas de los bloques que una
// arista LARGA conecta, para que esa arista salga corta y casi vertical en vez
// de cruzar el lienzo entero.
//
// Corre DESPUÉS de que `deriveSagaMap` haya construido las aristas, y no dentro
// de su bucle de pintado, porque las de ventana e itinerario todavía no existen
// mientras ese bucle corre. No conoce bloques, ni ventanas, ni itinerarios:
// solo nodos y aristas.

/** Columnas que un bloque puede desplazarse, contadas desde la columna 0.
 *
 *  Existe porque sin tope la escalera diagonal vuelve por la puerta de atrás: si
 *  el bloque 2 se alinea con la última columna del 1, y el 3 con la última del
 *  2, los offsets se acumulan y el ancho del dibujo vuelve a ser la suma de
 *  todos los bloques — exactamente lo que quitó la decisión de `derive-map.ts:113`
 *  («una fila por bloque, compacta»). Con el tope, el ancho
 *  es «el del bloque más largo, más 4». */
export const MAX_COL_OFFSET = 4;

/** Aristas que cruzan el lienzo, y por tanto las únicas que vale la pena
 *  enderezar. `principal` (la cadena) queda fuera a propósito: alinear por ella
 *  reproduce esa misma escalera, y además casi nunca cruza — une huecos
 *  consecutivos, que ya están al lado. */
const TIPOS_LARGOS = new Set(["requisito", "opcional", "itinerario"]);

/** Mediana, no media: aguanta un ancla rara en un extremo. Óptimo L1, que es la
 *  distancia que de verdad importa aquí (cuánto se desvía cada arista de la
 *  vertical). Con un número par de valores promedia los dos centrales; el
 *  llamante redondea. */
function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export function alignRowsToLongEdges(graph: SagaGraph): SagaGraph {
  if (graph.nodes.length === 0) return graph;

  const nodosDeBloque = new Map<string | null, SagaGraphNode[]>();
  const bloqueDeNodo = new Map<string, string | null>();
  for (const n of graph.nodes) {
    const clave = n.groupSagaId;
    bloqueDeNodo.set(n.id, clave);
    const lista = nodosDeBloque.get(clave);
    if (lista === undefined) nodosDeBloque.set(clave, [n]);
    else lista.push(n);
  }

  // Vecinos por arista larga, en los dos sentidos: a la hora de alinear da igual
  // quién es el origen y quién el destino, lo que importa es qué dos nodos están
  // unidos.
  const vecinos = new Map<string, string[]>();
  const unir = (a: string, b: string) => {
    const lista = vecinos.get(a);
    if (lista === undefined) vecinos.set(a, [b]);
    else lista.push(b);
  };
  for (const e of graph.edges) {
    if (!TIPOS_LARGOS.has(e.type)) continue;
    unir(e.source, e.target);
    unir(e.target, e.source);
  }

  // De arriba abajo, por la fila donde empieza cada bloque: cada uno se alinea
  // con lo que ya está colocado encima. Un bloque cuya única ancla queda DEBAJO
  // no se mueve — se moverá el de abajo cuando le toque.
  const filaDe = (lista: SagaGraphNode[]) => Math.min(...lista.map((n) => n.y));
  const bloques = [...nodosDeBloque.entries()].sort((a, b) => filaDe(a[1]) - filaDe(b[1]));

  const xFinal = new Map<string, number>();
  const colocados = new Set<string | null>();

  for (const [clave, lista] of bloques) {
    const deltas: number[] = [];
    for (const n of lista) {
      for (const otro of vecinos.get(n.id) ?? []) {
        const suBloque = bloqueDeNodo.get(otro);
        if (suBloque === undefined || suBloque === clave || !colocados.has(suBloque)) continue;
        deltas.push((xFinal.get(otro)! - n.x) / NODE_STEP_X);
      }
    }
    const bruto = deltas.length === 0 ? 0 : Math.round(mediana(deltas));
    const offset = Math.min(Math.max(bruto, 0), MAX_COL_OFFSET);
    for (const n of lista) xFinal.set(n.id, n.x + offset * NODE_STEP_X);
    colocados.add(clave);
  }

  // El mapa vuelve a empezar en la columna 0: React Flow encuadra con `fitView`,
  // pero un lienzo que empieza en la 3 desplaza también el mini-preview del CTA,
  // que no encuadra.
  const minimo = Math.min(...graph.nodes.map((n) => xFinal.get(n.id)!));
  return {
    nodes: graph.nodes.map((n) => ({ ...n, x: xFinal.get(n.id)! - minimo })),
    edges: graph.edges,
  };
}
