import type { AtlasLayout } from "@/lib/sagas/atlas/layout";

type P = { x: number; y: number };

/** Posición del centro de cada obra por clave. */
export const positions = (layout: AtlasLayout) => new Map(layout.items.map((i) => [i.key, i] as const));

/** Curva suave por una serie de puntos: cuadráticas entre puntos medios. */
export function smoothPath(pts: P[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const mid = (a: P, b: P) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = mid(pts[0], pts[1]);
  let d = `M ${pts[0].x} ${pts[0].y} L ${first.x} ${first.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    d += ` Q ${pts[i].x} ${pts[i].y} ${m.x} ${m.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}
