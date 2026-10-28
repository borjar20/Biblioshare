import { fit } from "@/lib/atlas/camera";
import type { Camera, Extent, Point, Viewport } from "@/lib/atlas/types";

// Cámara del atlas de la saga contando con el cromo: la barra superior y el dock tapan
// franjas del lienzo, así que «centrar» y «encajar» se hacen en la zona libre entre ambos.

/** Alto, en px de pantalla, que tapan la barra superior (arriba) y el dock (abajo). */
export type Insets = { top: number; bottom: number };
export const NO_INSETS: Insets = { top: 0, bottom: 0 };

/** Aire alrededor de la saga encajada, además del cromo. */
const MARGIN: Point = { x: 48, y: 32 };

/** Cámara a zoom `k` que deja `p` en el centro de la zona libre (no del viewport). */
export function centreIn(p: Point, k: number, insets: Insets): Camera {
  // En pantalla, p cae en H/2 + (top − bottom)/2: el centro de la franja [top, H − bottom].
  return { x: p.x, y: p.y + (insets.bottom - insets.top) / (2 * k), k };
}

/** Encaja `extent` en la zona libre (hasta `maxK`) y la centra en ella. */
export function fitVisible(extent: Extent, vp: Viewport, insets: Insets, maxK: number): Camera {
  const c = fit(extent, vp, { x: MARGIN.x, y: insets.top + insets.bottom + MARGIN.y }, maxK);
  return centreIn(c, c.k, insets);
}
