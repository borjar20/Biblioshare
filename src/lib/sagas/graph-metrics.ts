import type { SagaGraphNode } from "./map-types";

// Medidas en PÍXELES de cada tipo de nodo del grafo 2D, escritas UNA vez. Las
// consume `graph-nodes.tsx` (que las dibuja) y `map-overlays.ts` (que envuelve
// nodos con una cápsula o un marco, y para eso necesita saber cuánto ocupan).
// Antes vivían como clases Tailwind literales dentro de `graph-nodes.tsx` y
// repetidas en los comentarios de `derive-map.ts` que justifican
// NODE_STEP_X/NODE_STEP_Y; un tercer sitio que las repitiera en silencio es
// como se desincronizan: una cápsula calculada con 78×116 se queda corta el día
// que la portada crezca, y nada avisa.
//
// NO incluyen la etiqueta que cuelga bajo el nodo: esa es ancha (150 px) y se
// solapa con las columnas vecinas a propósito. La cápsula envuelve la obra, no
// su rótulo, igual que en el mockup.
export const NODE_BOX = {
  cover: { w: 78, h: 116 },
  medallion: { w: 58, h: 58 },
  saga: { w: 120, h: 120 },
} as const;

/** Qué caja ocupa un nodo, con la MISMA regla con la que `saga-graph-view.tsx`
 *  elige su tipo de nodo: bloque → tarjeta, `menor` → medallón, resto →
 *  portada. Si esa regla cambia, cambia aquí y en un solo sitio más. */
export function nodeBoxOf(node: SagaGraphNode): { w: number; h: number } {
  if (node.kind === "saga") return NODE_BOX.saga;
  return node.level === "menor" ? NODE_BOX.medallion : NODE_BOX.cover;
}
