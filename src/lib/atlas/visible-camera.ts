import { fit, toScreen } from "@/lib/atlas/camera";
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

/**
 * ¿Cae `p` dentro de la zona libre (entre la barra y el dock, y dentro del ancho)? `half` es
 * el medio ancho y medio alto de la portada en unidades del plano (ya con su `scale`): se
 * exige que quepa entera, no solo su centro. Sin `half`, solo el punto.
 */
export function inVisibleArea(cam: Camera, vp: Viewport, insets: Insets, p: Point, half: Point = { x: 0, y: 0 }): boolean {
  const s = toScreen(cam, vp, p);
  const hx = half.x * cam.k;
  const hy = half.y * cam.k;
  return s.x - hx >= 0 && s.x + hx <= vp.width && s.y - hy >= insets.top && s.y + hy <= vp.height - insets.bottom;
}

/** Aire entre la obra y la tarjeta, y entre la tarjeta y los bordes. */
const CARD_GAP = 12;
const CARD_EDGE = 8;
const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Sitio de la mini-ficha flotante (≥ 640 px): a la derecha de la obra, o a la izquierda si
 * no cabe; centrada en vertical con la obra y siempre dentro de la zona libre. `anchor` es
 * el centro de la obra en pantalla y su medio ancho y medio alto ya escalados.
 */
export function cardPosition(
  anchor: { x: number; y: number; halfW: number; halfH: number },
  vp: Viewport,
  insets: Insets,
  card: { width: number; height: number },
): { left: number; top: number; side: "left" | "right" } {
  const right = anchor.x + anchor.halfW + CARD_GAP;
  const maxLeft = vp.width - CARD_EDGE - card.width;
  const top = clampTo(anchor.y - card.height / 2, insets.top + CARD_EDGE, vp.height - insets.bottom - card.height - CARD_EDGE);
  if (right <= maxLeft) return { left: right, top, side: "right" };
  const left = anchor.x - anchor.halfW - CARD_GAP - card.width;
  return { left: clampTo(left, CARD_EDGE, maxLeft), top, side: "left" };
}
