import type { AtlasLayout, Orientation } from "@/lib/sagas/atlas/layout";

type P = { x: number; y: number };

/** Posición del centro de cada obra por clave. */
export const positions = (layout: AtlasLayout) => new Map(layout.items.map((i) => [i.key, i] as const));

/** Cadena de arcos entre puntos consecutivos: cada tramo es una cuadrática que se aparta del eje
 *  (hacia arriba en `h`; hacia -x en `v`) con una flecha de 0,25 × la distancia, con tope. Si todas las
 *  obras caen en la misma fila, un salto fuera de orden se lee como un arco grande. Tramos de
 *  longitud 0 no se dibujan. `side = -1` los dobla al otro lado (abajo en `h`; hacia +x en `v`). */
export const ARC_RATIO = 0.25;
export const ARC_MAX_PEAK = 160;
export function arcChainPath(pts: P[], orientation: Orientation, side: 1 | -1 = 1): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist === 0) continue;
    // El punto de control dista el doble que la cima de la cuadrática.
    const off = side * 2 * Math.min(ARC_RATIO * dist, ARC_MAX_PEAK);
    const cx = (a.x + b.x) / 2 + (orientation === "v" ? -off : 0);
    const cy = (a.y + b.y) / 2 + (orientation === "h" ? -off : 0);
    d += `${d ? " " : ""}M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  }
  return d;
}
