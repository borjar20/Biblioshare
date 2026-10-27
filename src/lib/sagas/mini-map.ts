import type { SagaAccentToken } from "./accents";
import type { SagaGraph } from "./map-types";

// Vista previa diminuta del grafo para la tarjeta «Explora el mapa» (plan fase
// 2, tarea 4). Función pura: solo normaliza coordenadas; el dibujo es del
// componente.

const W = 160;
const H = 80;
const MARGIN = 8;

export type MiniMap = {
  width: number;
  height: number;
  points: Array<{ id: string; cx: number; cy: number; accent: SagaAccentToken; done: boolean }>;
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; dashed: boolean }>;
};

/** Mapea `v` de [min, max] a [lo, hi]; con rango nulo, al centro. */
function scale(v: number, min: number, max: number, lo: number, hi: number): number {
  if (max === min) return (lo + hi) / 2;
  return lo + ((v - min) / (max - min)) * (hi - lo);
}

export function miniMapPoints(graph: SagaGraph, max = 40): MiniMap {
  const items = graph.nodes
    .filter((n) => n.kind === "item")
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const ao = a.n.orderNo ?? Infinity;
      const bo = b.n.orderNo ?? Infinity;
      return ao === bo ? a.i - b.i : ao < bo ? -1 : 1;
    })
    .slice(0, max)
    .map((e) => e.n);

  const xs = items.map((n) => n.x);
  const ys = items.map((n) => n.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

  const pos = new Map<string, { cx: number; cy: number }>();
  const points = items.map((n) => {
    const cx = scale(n.x, minX, maxX, MARGIN, W - MARGIN);
    const cy = scale(n.y, minY, maxY, MARGIN, H - MARGIN);
    pos.set(n.id, { cx, cy });
    return { id: n.id, cx, cy, accent: n.accent, done: n.status === "completed" };
  });

  const lines = graph.edges.flatMap((e) => {
    const a = pos.get(e.source);
    const b = pos.get(e.target);
    if (!a || !b) return [];
    return [{ x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy, dashed: e.type !== "principal" }];
  });

  return { width: W, height: H, points, lines };
}
