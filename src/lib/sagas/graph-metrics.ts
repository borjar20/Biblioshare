import type { SagaGraphNode } from "./map-types";

// Medidas en PÍXELES de cada tipo de nodo del grafo derivado, escritas UNA vez.
// Las consumen `derive-map.ts` y `layout-map.ts` (el grafo 2D de React Flow que
// las dibujaba se retiró con el atlas, spec 2026-10-28).
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

// `deriveSagaMap` tiene que devolver coordenadas en PÍXELES, no en índice de
// columna/fila (0, 1, 2…). Nació para la vista de grafo con React Flow (ya
// retirada con el atlas, spec 2026-10-28), que usaba `n.x`/`n.y` TAL CUAL como
// `position` de cada portada de 78×116px: con índices, todos los nodos caían
// unos sobre otros. Hoy las coordenadas las normaliza el mini-mapa de la
// tarjeta de la ficha (mini-map.ts), y el layout (layout-map.ts) sigue
// razonando en píxeles con estos pasos.
//
// Paso horizontal entre columnas: bajo cada portada cuelga una etiqueta de
// 150px, centrada sobre la tarjeta (78px de ancho). Dos columnas contiguas
// necesitan al menos 150px centro a centro para que sus etiquetas no se
// toquen; 180px deja ~30px de margen.
export const NODE_STEP_X = 180;

// Paso vertical entre filas (una fila = un bloque, `blocks.forEach((group,
// y) => …)`): la portada mide 116px de alto, más la etiqueta que cuelga
// debajo (`mt-2` = 8px + hasta dos líneas de `text-sm leading-tight`, unos
// 40px). Una fila necesita ~164px para no invadir la portada de la fila
// siguiente; 220px deja margen cómodo.
export const NODE_STEP_Y = 220;
